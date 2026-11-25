"""
Mentor Call Analytics (outgoing mentor -> student calls logged with feedback).

Read-only helpers over core.StudentFeedback. Deliberately independent of the Sales call analytics
(crm.CallAnalyticsView / LeadInteraction): nothing here imports from crm.

Who may see what is defined ONLY by the role sets below. Role strings are compared after
str(role).upper().strip(), so ' head - mentor ' matches 'HEAD - MENTOR'.
"""
import datetime
import logging
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Max, Q, Sum
from django.db.models.functions import Coalesce
from django.utils.dateparse import parse_date
from rest_framework.exceptions import PermissionDenied, ValidationError

from .followups import ist_today
from .models import StudentFeedback

logger = logging.getLogger(__name__)

IST = ZoneInfo('Asia/Kolkata')

# ── Access (adjust here) ────────────────────────────────────────────────────────────────────────────
# See every mentor's calls. is_superuser is always treated as this scope.
ALL_SCOPE_ROLES = {'SUPER_ADMIN', 'ADMIN', 'MANAGER'}
# See their own calls + calls by everyone in user.get_all_subordinates().
HEAD_MENTOR_ROLES = {'HEAD - MENTOR'}
# Everyone else (MENTOR, TEACHER, ACADEMIC, ACADEMIC_COORDINATOR, SALES, ...) gets 403.

# Roles offered in the admin mentor dropdown (anyone who has actually logged a call is offered too).
MENTOR_OPTION_ROLES = {'MENTOR', 'HEAD - MENTOR', 'ACADEMIC MENTOR', 'TEACHER'}

DEFAULT_RANGE_DAYS = 30

# ── Row classification ──────────────────────────────────────────────────────────────────────────────
# A real call = logged by the phone (mobile_call_id) or carrying a call outcome. Same rule as
# add_feedback's `has_call`. Manual feedback is ALSO stored as feedback_type='CALL', so that field is unusable.
CALL_Q = Q(mobile_call_id__isnull=False) | Q(call_status__isnull=False)
# Mentor WhatsApp logs: feedback_type='WHATSAPP' and never a phone-call marker (mobile_call_id / call_status).
#   chat: call_direction IS NULL   (MESSAGE_SENT=sent, CALL_DONE=connected, NO_ANSWER=no reply, NOT_REACHABLE=not on WA)
#   call: call_direction IS NOT NULL (CALL_DONE=connected with call_duration, NO_ANSWER=not connected)
# WhatsApp outcomes are self-reported by mentors; nothing verifies them.
WHATSAPP_Q = Q(feedback_type='WHATSAPP') & ~CALL_Q
WA_CHAT_Q = WHATSAPP_Q & Q(call_direction__isnull=True)
WA_CALL_Q = WHATSAPP_Q & Q(call_direction__isnull=False)
WA_CONNECTED_Q = Q(status='CALL_DONE')
MANUAL_Q = Q(mobile_call_id__isnull=True, call_status__isnull=True) & ~Q(feedback_type='WHATSAPP')
CONNECTED_Q = Q(call_status='CONNECTED')
MISSED_Q = Q(call_status__in=['MISSED', 'UNANSWERED'])
# "Call Done" saved without an outcome (the app sends call_status=null): unknown, kept out of connect rate
UNKNOWN_Q = Q(call_status__isnull=True) | Q(call_status='')
REC_Q = (Q(audio_recording__isnull=False) & ~Q(audio_recording='')) | \
        (Q(recording_url__isnull=False) & ~Q(recording_url=''))

def phone_metrics(phone_q=None):
    """
    Phone-call aggregates. phone_q=None: the queryset already holds phone calls only (the KPI query).
    Otherwise every aggregate is restricted to phone_q, so the same numbers come out of a mixed
    phone + WhatsApp queryset (leaderboard / trend grouped once over both channels).
    """
    def f(q=None):
        if phone_q is None:
            return q
        return phone_q if q is None else (phone_q & q)

    return dict(
        calls=Count('id', filter=f()),
        connected=Count('id', filter=f(CONNECTED_Q)),
        missed=Count('id', filter=f(MISSED_Q)),
        unknown_outcome=Count('id', filter=f(UNKNOWN_Q)),
        talk_time_sec=Coalesce(Sum('call_duration', filter=f(CONNECTED_Q)), 0),
        avg_duration_sec=Avg('call_duration', filter=f(CONNECTED_Q & Q(call_duration__gt=0))),
        longest_call_sec=Coalesce(Max('call_duration', filter=f(CONNECTED_Q)), 0),
        with_recording=Count('id', filter=f(REC_Q)),
        unique_students=Count('student', distinct=True, filter=f()),
    )


METRICS = phone_metrics()

# WhatsApp aggregates; safe on a mixed queryset (every filter includes WHATSAPP_Q).
WA_METRICS = dict(
    wa_messages=Count('id', filter=WA_CHAT_Q & Q(status='MESSAGE_SENT')),
    wa_connected=Count('id', filter=WHATSAPP_Q & WA_CONNECTED_Q),                 # chats + calls marked connected
    wa_no_reply=Count('id', filter=WA_CHAT_Q & Q(status='NO_ANSWER')),
    wa_not_on_whatsapp=Count('id', filter=WHATSAPP_Q & Q(status='NOT_REACHABLE')),
    wa_calls=Count('id', filter=WA_CALL_Q),
    wa_calls_connected=Count('id', filter=WA_CALL_Q & WA_CONNECTED_Q),
    wa_talk_time_sec=Coalesce(Sum('call_duration', filter=WA_CALL_Q & WA_CONNECTED_Q), 0),
    wa_students_connected=Count('student', distinct=True, filter=WHATSAPP_Q & WA_CONNECTED_Q),
)

CHANNELS = ('all', 'phone', 'whatsapp')


def connected_metrics(phone_q, include_phone=True, include_whatsapp=True):
    """
    Distinct-student "connected" counts. students_connected_total is ONE distinct count over the union of
    connected phone calls and connected WhatsApp entries, so a student reached on both counts once.
    """
    phone_conn = phone_q & CONNECTED_Q
    wa_conn = WHATSAPP_Q & WA_CONNECTED_Q
    either = (phone_conn | wa_conn) if include_phone and include_whatsapp else (phone_conn if include_phone else wa_conn)
    out = {'students_connected_total': Count('student', distinct=True, filter=either)}
    if include_phone:
        out['phone_connected'] = Count('id', filter=phone_conn)
        out['phone_students_connected'] = Count('student', distinct=True, filter=phone_conn)
    return out


def normalize_role(user):
    return str(getattr(user, 'role', '') or '').upper().strip()


def can_view(user):
    if not user or not user.is_authenticated:
        return False
    role = normalize_role(user)
    return bool(user.is_superuser or role in ALL_SCOPE_ROLES or role in HEAD_MENTOR_ROLES)


def allowed_mentor_ids(user):
    """
    None  -> every mentor (admin / manager / superuser)
    set   -> these user ids only (head mentor: self + subordinates)
    Raises PermissionDenied for everyone else.
    """
    if not user or not user.is_authenticated:
        raise PermissionDenied('Authentication required')
    role = normalize_role(user)
    if user.is_superuser or role in ALL_SCOPE_ROLES:
        return None
    if role in HEAD_MENTOR_ROLES:
        subordinate_ids = []
        try:
            user_model = get_user_model()
            subordinate_ids = [s.pk for s in user.get_all_subordinates() if isinstance(s, user_model)]
        except Exception:
            # Bad hierarchy data must not 500 the page; fall back to own calls (same as StudentViewSet)
            logger.exception("get_all_subordinates failed for user %s; using own calls only", user.pk)
        return {user.pk, *subordinate_ids}
    raise PermissionDenied('You do not have permission to view mentor call analytics.')


def _int_param(params, key):
    raw = params.get(key)
    if raw in (None, ''):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ValidationError({key: f'Invalid {key}: {raw}'})


def scoped_feedback(user, mentor_id=None, allowed=...):
    """All StudentFeedback rows (calls AND manual) the user may see, optionally narrowed to one mentor."""
    if allowed is ...:
        allowed = allowed_mentor_ids(user)
    qs = StudentFeedback.objects.all()
    if mentor_id is not None:
        if allowed is not None and mentor_id not in allowed:
            raise PermissionDenied('That mentor is outside your team.')
        return qs.filter(mentor_id=mentor_id)
    return qs if allowed is None else qs.filter(mentor_id__in=allowed)


def scoped_calls(user, mentor_id=None):
    return scoped_feedback(user, mentor_id).filter(CALL_Q)


def parse_range(params):
    """(start, end) dates on feedback_date. Default: last 30 days ending today (India). 400 on bad input."""
    def parse(key):
        raw = params.get(key)
        if raw in (None, ''):
            return None
        try:
            value = parse_date(str(raw))
        except (TypeError, ValueError):
            value = None
        if value is None:
            raise ValidationError({key: f'Invalid {key}: {raw} (expected YYYY-MM-DD)'})
        return value

    start, end = parse('start_date'), parse('end_date')
    span = datetime.timedelta(days=DEFAULT_RANGE_DAYS - 1)
    if end is None:
        end = ist_today() if start is None or start <= ist_today() else start
    if start is None:
        start = end - span
    if start > end:
        raise ValidationError({'start_date': 'start_date must be on or before end_date'})
    return start, end


def apply_filters(qs, params, include_status=True):
    """
    Filters shared by the summary, the list and the CSV. mentor_id is handled by scoped_feedback (scope check).
    Returns (qs, start, end).
    """
    start, end = parse_range(params)
    qs = qs.filter(feedback_date__gte=start, feedback_date__lte=end)

    for key, lookup in (('batch_id', 'student__batch_id'), ('course_id', 'student__course_id'),
                        ('program_id', 'student__program_type_id'), ('student_id', 'student_id')):
        value = _int_param(params, key)
        if value is not None:
            qs = qs.filter(**{lookup: value})

    if include_status:
        qs = qs.filter(status_q(params))
    return qs, start, end


def status_q(params):
    """The call_status filter as a Q (phone calls only; WhatsApp rows have no call_status). Q() = no filter."""
    status_val = str(params.get('call_status') or '').upper().strip()
    if status_val == 'MISSED':
        return MISSED_Q
    if status_val == 'UNKNOWN':
        return UNKNOWN_Q
    if status_val:
        return Q(call_status__iexact=status_val)
    return Q()


def parse_channel(params):
    channel = str(params.get('channel') or 'all').lower().strip()
    if channel not in CHANNELS:
        raise ValidationError({'channel': f'Invalid channel: {channel} (use all, phone or whatsapp)'})
    return channel


class Scope:
    """Everything a request resolves to: the caller's allowed ids, the filtered querysets and the date range."""

    def __init__(self, allowed, mentor_id, calls, manual_base, start, end, phone_q=CALL_Q, channel='all'):
        self.allowed = allowed            # None = everyone, else set of user ids
        self.mentor_id = mentor_id
        self.calls = calls                # real phone calls, all filters applied
        self.manual_base = manual_base    # all rows, same filters minus call_status (manual + WhatsApp source)
        self.start, self.end = start, end
        self.phone_q = phone_q            # CALL_Q & the call_status filter: "a phone call in this view"
        self.channel = channel            # 'all' | 'phone' | 'whatsapp'

    @property
    def include_phone(self):
        return self.channel in ('all', 'phone')

    @property
    def include_whatsapp(self):
        return self.channel in ('all', 'whatsapp')

    @property
    def whatsapp(self):
        """WhatsApp log rows (date/mentor/batch filters apply; call_status does not)."""
        return self.manual_base.filter(WHATSAPP_Q)

    @property
    def channel_q(self):
        """Rows of the selected channel(s), for one grouped query over both."""
        if self.channel == 'phone':
            return self.phone_q
        if self.channel == 'whatsapp':
            return WHATSAPP_Q
        return self.phone_q | WHATSAPP_Q

    @property
    def combined(self):
        return self.manual_base.filter(self.channel_q)

    def connected_q(self, channel=None):
        """Connected contacts of a channel: phone CONNECTED call, or WhatsApp entry marked CALL_DONE (chat or call)."""
        channel = channel or self.channel
        phone = self.phone_q & CONNECTED_Q
        wa = WHATSAPP_Q & WA_CONNECTED_Q
        if channel == 'phone':
            return phone
        if channel == 'whatsapp':
            return wa
        return phone | wa


def build_scope(request):
    """Scope check first (403 before any parsing work), then filters (400 on bad input)."""
    allowed = allowed_mentor_ids(request.user)
    params = request.query_params
    mentor_id = _int_param(params, 'mentor_id')
    channel = parse_channel(params)
    base = scoped_feedback(request.user, mentor_id, allowed=allowed)
    manual_base, start, end = apply_filters(base, params, include_status=False)
    phone_q = CALL_Q & status_q(params)
    return Scope(allowed, mentor_id, manual_base.filter(phone_q), manual_base, start, end,
                 phone_q=phone_q, channel=channel)


OUTCOMES = ('connected',)


def parse_outcome(params):
    """Optional ?outcome= for the call list. Only 'connected' is supported."""
    outcome = str(params.get('outcome') or '').lower().strip()
    if outcome and outcome not in OUTCOMES:
        raise ValidationError({'outcome': f'Invalid outcome: {outcome} (use connected)'})
    return outcome or None


# ── Pending students ───────────────────────────────────────────────────────────────────────────────
# A connected contact by either channel (whoever logged it).
CONNECTED_ANY_Q = (CALL_Q & CONNECTED_Q) | (WHATSAPP_Q & WA_CONNECTED_Q)
# A real contact attempt (phone call or WhatsApp entry) that did not connect.
ATTEMPT_NOT_CONNECTED_Q = (CALL_Q | WHATSAPP_Q) & ~CONNECTED_ANY_Q

# Students counted for "pending": enrolled in a batch and academically active.
# Excluded: is_active=False, academic_status ON_BREAK / DISCONTINUED, DUPLICATE leads, students without a batch.
ACTIVE_STUDENT_Q = Q(is_active=True, academic_status='ACTIVE', batch__isnull=False) & ~Q(lead_status__iexact='DUPLICATE')


def mentor_student_link_q(mentor_ids):
    """
    Students of these mentors. Same link as StudentViewSet.get_queryset (mentor branch), copied, not imported:
    the batch's primary mentor, a secondary mentor, or the batch teacher.
    """
    return (Q(batch__primary_mentor_id__in=mentor_ids) |
            Q(batch__secondary_mentors__id__in=mentor_ids) |
            Q(batch__teacher_id__in=mentor_ids))


def pending_students(scope, params):
    """
    Active students in the caller's scope with NO connected contact (phone CONNECTED or WhatsApp CALL_DONE)
    between scope.start and scope.end. Everything is annotated with subqueries: no Python loops.
    Ordering: overdue follow-ups first, then never connected, then oldest last connected date.
    """
    from django.db.models import Case, DateField, Exists, F, IntegerField, OuterRef, Subquery, Value, When
    from .models import Student

    students = Student.objects.filter(ACTIVE_STUDENT_Q)

    # Scope (same allowed_mentor_ids result as the call views) + optional mentor_id (already scope-checked)
    mentor_ids = None if scope.allowed is None else set(scope.allowed)
    if scope.mentor_id is not None:
        mentor_ids = {scope.mentor_id}
    if mentor_ids is not None:
        students = students.filter(pk__in=Student.objects.filter(mentor_student_link_q(mentor_ids)).values('pk'))

    for key, lookup in (('batch_id', 'batch_id'), ('course_id', 'course_id'),
                        ('program_id', 'program_type_id'), ('student_id', 'pk')):
        value = _int_param(params, key)
        if value is not None:
            students = students.filter(**{lookup: value})

    fb = StudentFeedback.objects.filter(student=OuterRef('pk'))
    in_range = Q(feedback_date__gte=scope.start, feedback_date__lte=scope.end)
    latest = fb.order_by('-feedback_date', '-id')
    attempts = (fb.filter(in_range & ATTEMPT_NOT_CONNECTED_Q).order_by().values('student')
                .annotate(c=Count('id')).values('c'))
    today = ist_today()

    return (students
            .annotate(connected_in_range=Exists(fb.filter(in_range & CONNECTED_ANY_Q)))
            .filter(connected_in_range=False)
            .annotate(
                last_contact_date=Subquery(latest.values('feedback_date')[:1]),
                last_connected_date=Subquery(fb.filter(CONNECTED_ANY_Q).order_by('-feedback_date', '-id')
                                             .values('feedback_date')[:1]),
                attempts_in_range=Coalesce(Subquery(attempts, output_field=IntegerField()), Value(0)),
                next_followup_date=Subquery(latest.values('next_followup_date')[:1]),
            )
            .annotate(
                is_overdue=Case(When(next_followup_date__lt=today, then=Value(1)), default=Value(0),
                                output_field=IntegerField()),
                # Only overdue rows get a date here, so non-overdue follow-ups don't jump the queue
                overdue_since=Case(When(next_followup_date__lt=today, then=F('next_followup_date')), default=None,
                                   output_field=DateField()),
                never_connected=Case(When(last_connected_date__isnull=True, then=Value(1)), default=Value(0),
                                     output_field=IntegerField()),
            )
            .select_related('batch', 'batch__primary_mentor')
            .order_by('-is_overdue', F('overdue_since').asc(nulls_last=True), '-never_connected',
                      F('last_connected_date').asc(nulls_first=True), 'first_name', 'id'))


def is_truthy(value):
    return str(value or '').lower() in ('1', 'true', 'yes', 'on')


def user_display_name(first, last, username):
    return f"{first or ''} {last or ''}".strip() or username or ''


def connect_rate(connected, calls, unknown):
    denominator = (calls or 0) - (unknown or 0)
    if denominator <= 0:
        return None
    return round(100.0 * (connected or 0) / denominator, 1)
