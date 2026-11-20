"""
Mentor morning push: one "Student follow-ups" notification per mentor per India date, from
09:00 IST, listing that day's and overdue follow-ups (latest StudentFeedback.next_followup_date,
same rule as GET /students/my_followups/: the feedback's author and the batch's primary mentor).
Called by crm send_task_reminders every minute.

Sent at most once per mentor per day: a MentorFollowupDigest (user, date) row is claimed before
anything is sent. If the server is down at 09:00, the digest goes out on the first run after that.
"""
from collections import OrderedDict
from datetime import time

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone

from notifications.models import MentorFollowupDigest, Notification
from notifications.push import send_expo_batch

from .followups import IST, followup_recipient_ids, students_with_followups

DIGEST_HOUR = 9
DIGEST_TITLE = 'Student follow-ups'
DIGEST_TARGET_URL = '/mentor'  # web Mentor module; mobile notifications.tsx maps '/mentor' to the Mentor module
CHANNEL_ID = 'followups'
NAMES_SHOWN = 2


def _mentor_roles():
    from .views import MENTOR_ROLES  # same role list the my_followups endpoint uses
    return MENTOR_ROLES


def _plural(n, word):
    return f"{n} student {word}{'' if n == 1 else 's'}"


def digest_body(due_today, overdue, names):
    """'You have 3 student follow-ups today and 1 overdue: Asha, Rahul, +2'."""
    if due_today and overdue:
        head = f"You have {_plural(due_today, 'follow-up')} today and {overdue} overdue"
    elif due_today:
        head = f"You have {_plural(due_today, 'follow-up')} today"
    else:
        head = f"You have {overdue} overdue {'student follow-up' if overdue == 1 else 'student follow-ups'}"
    shown = names[:NAMES_SHOWN]
    extra = len(names) - len(shown)
    listed = ', '.join(shown) + (f', +{extra}' if extra > 0 else '')
    return f"{head}: {listed}" if listed else head


def pending_digests(today):
    """{mentor_id: {'due_today': n, 'overdue': n, 'names': [...]}} for follow-ups due today or earlier."""
    rows = (
        students_with_followups()
        .filter(fu_date__lte=today)
        .order_by('fu_date', 'id')
        .values_list('fu_mentor_id', 'fu_batch_mentor_id', 'fu_date', 'first_name', 'last_name')
    )
    digests = OrderedDict()
    for mentor_id, batch_mentor_id, fu_date, first, last in rows:
        # Feedback author + assigned mentor; a set, so the same person is never counted twice
        for recipient_id in followup_recipient_ids(mentor_id, batch_mentor_id):
            d = digests.setdefault(recipient_id, {'due_today': 0, 'overdue': 0, 'names': []})
            if fu_date < today:
                d['overdue'] += 1
            else:
                d['due_today'] += 1
            d['names'].append((first or last or 'Student').strip())
    return digests


def _claim(user, today, count):
    try:
        with transaction.atomic():
            MentorFollowupDigest.objects.create(user=user, date=today, count=count)
        return True
    except IntegrityError:
        return False  # already sent today (or another run just claimed it)


def send_mentor_followup_digests(now=None, dry_run=False, hour=DIGEST_HOUR, write=None):
    """
    Returns a summary dict. `write` (optional) receives one line per mentor in dry-run mode.
    Does nothing before `hour`:00 IST.
    """
    from crm.management.commands.send_task_reminders import push_tokens_for  # same device-token rules

    summary = {'mentors': 0, 'claimed': 0, 'pushed': 0, 'push_errors': 0, 'no_device': 0}
    now_ist = timezone.localtime(now or timezone.now(), IST)
    if now_ist.time() < time(hour=hour):
        return summary
    today = now_ist.date()

    digests = pending_digests(today)
    if not digests:
        return summary
    already = set(
        MentorFollowupDigest.objects.filter(date=today, user_id__in=list(digests)).values_list('user_id', flat=True)
    )
    roles = _mentor_roles()
    users = {u.pk: u for u in get_user_model().objects.filter(pk__in=[m for m in digests if m not in already])}

    messages = []
    for mentor_id, d in digests.items():
        user = users.get(mentor_id)
        if user is None or not user.is_active:
            continue  # already sent today, or no longer active
        role = str(user.role or '').upper().strip()
        if not (user.is_superuser or role in roles):
            continue  # same audience as GET /students/my_followups/
        summary['mentors'] += 1
        count = d['due_today'] + d['overdue']
        body = digest_body(d['due_today'], d['overdue'], d['names'])
        tokens = push_tokens_for(user)

        if dry_run:
            if write:
                write(f"[dry-run] mentor={user.username} date={today} today={d['due_today']} "
                      f"overdue={d['overdue']} devices={len(tokens)} body={body!r}")
            continue

        if not _claim(user, today, count):
            continue
        summary['claimed'] += 1
        Notification.objects.create(
            user=user, title=DIGEST_TITLE, message=body, notification_type='INFO', target_url=DIGEST_TARGET_URL,
        )
        if not tokens:
            summary['no_device'] += 1
            continue
        data = {'type': 'MENTOR_FOLLOWUPS', 'date': str(today), 'count': count}
        messages.extend({
            'to': token, 'title': DIGEST_TITLE, 'body': body, 'sound': 'default',
            'channelId': CHANNEL_ID, 'priority': 'high', 'data': data,
        } for token in tokens)

    if messages:
        result = send_expo_batch(messages)
        summary['pushed'] = result['sent']
        summary['push_errors'] = result['errors']
    return summary
