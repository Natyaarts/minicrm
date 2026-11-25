"""
Mentor Call Analytics API (read-only). Separate from Sales call analytics (/api/crm/call-analytics/).

GET /api/mentor-call-analytics/          summary: kpis, status breakdown, leaderboard, trend, hourly, mentor options
GET /api/mentor-call-analytics/calls/    paginated call list; ?export=csv streams every filtered row as CSV

Access and scope: core/call_analytics.py (ALL_SCOPE_ROLES, HEAD_MENTOR_ROLES).
"""
import csv
import datetime
import re

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.db.models.functions import ExtractHour
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .call_analytics import (
    CALL_Q, IST, MANUAL_Q, METRICS, MENTOR_OPTION_ROLES, WA_METRICS, WHATSAPP_Q, build_scope, connect_rate,
    connected_metrics, direction_q, incoming_metrics, is_truthy, parse_direction, parse_outcome, pending_students,
    phone_metrics, user_display_name,
)
from .models import StudentFeedback
from .pagination import StandardResultsSetPagination
from .serializers import recording_absolute_url

DELETED_USER = 'Deleted user'
INCOMING_KEYS = ('incoming_calls', 'incoming_connected', 'incoming_missed', 'incoming_talk_time_sec',
                 'incoming_students_connected')


class MentorCallAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        scope = build_scope(request)
        calls, start, end, allowed = scope.calls, scope.start, scope.end, scope.allowed
        with_phone, with_wa = scope.include_phone, scope.include_whatsapp
        nz = lambda v: v if v is not None else 0   # noqa: E731

        # 1. Phone KPIs (+ hourly coverage) in one query: unchanged maths, still CALL_Q only.
        #    channel=whatsapp: phone blocks are not computed and come back as null.
        k = None
        if with_phone:
            k = calls.aggregate(**METRICS, with_start_time=Count('id', filter=Q(start_time__isnull=False)))
            kpis = {
                'total_calls': k['calls'],
                'connected': k['connected'],
                'missed': k['missed'],
                'unknown_outcome': k['unknown_outcome'],
                # The app never sends these outcomes yet: null = "n/a", not zero
                'rejected': None, 'busy': None, 'failed': None,
                'connect_rate': connect_rate(k['connected'], k['calls'], k['unknown_outcome']),
                'talk_time_sec': k['talk_time_sec'],
                'avg_duration_sec': round(k['avg_duration_sec']) if k['avg_duration_sec'] is not None else 0,
                'longest_call_sec': k['longest_call_sec'],
                'with_recording': k['with_recording'],
                'unique_students': k['unique_students'],
            }
        else:
            kpis = {key: None for key in ('total_calls', 'connected', 'missed', 'unknown_outcome', 'rejected', 'busy',
                                          'failed', 'connect_rate', 'talk_time_sec', 'avg_duration_sec',
                                          'longest_call_sec', 'with_recording', 'unique_students')}
        kpis['manual_entries'] = None
        if is_truthy(request.query_params.get('include_manual')):
            kpis['manual_entries'] = scope.manual_base.filter(MANUAL_Q).count()
        # Active students in scope with no connected contact (either channel) in the range; same query as the
        # /pending-students/ list, so the card and the modal total always agree.
        kpis['pending_count'] = pending_students(scope, request.query_params).count()

        # 2. WhatsApp totals + distinct students connected, in one query over the selected channel(s).
        #    students_connected_total is a single distinct count over both channels (never phone + WhatsApp).
        agg = dict(connected_metrics(scope.phone_q, with_phone, with_wa, incoming_q=scope.incoming_q))
        if with_wa:
            agg.update(WA_METRICS)
        if with_phone:
            agg.update(incoming_metrics(scope.incoming_q))
        c = scope.combined.aggregate(**agg)
        kpis['whatsapp'] = {key: c[key] for key in WA_METRICS} if with_wa else None
        # Incoming calls (student called the mentor): new keys, not part of total_calls / connect rate
        for key in INCOMING_KEYS:
            kpis[key] = c[key] if with_phone else None
        kpis['phone_students_connected'] = c['phone_students_connected'] if with_phone else None
        kpis['students_connected_total'] = c['students_connected_total']

        # 3. Status breakdown (phone)
        status_breakdown = [
            {'call_status': r['call_status'] or None, 'count': r['count']}
            for r in calls.values('call_status').annotate(count=Count('id')).order_by('-count')
        ] if with_phone else []

        # 4. Leaderboard: ONE grouped query over the selected channel(s), filtered aggregates, one row per caller
        lb_metrics = dict(connected_metrics(scope.phone_q, with_phone, with_wa, incoming_q=scope.incoming_q))
        if with_phone:
            lb_metrics.update(phone_metrics(scope.phone_q))
            lb_metrics.update(incoming_metrics(scope.incoming_q))
        if with_wa:
            lb_metrics.update(WA_METRICS)
        rows = (scope.combined
                .values('mentor_id', 'mentor__first_name', 'mentor__last_name', 'mentor__username', 'mentor__role')
                .annotate(**lb_metrics)
                .order_by(*(('-talk_time_sec', '-calls') if with_phone else ()), '-students_connected_total'))
        leaderboard = []
        for r in rows:   # one iteration per mentor (grouped rows), not per call
            entry = {
                'mentor_id': r['mentor_id'],
                'name': (user_display_name(r['mentor__first_name'], r['mentor__last_name'], r['mentor__username'])
                         if r['mentor_id'] else DELETED_USER),
                'role': (str(r['mentor__role'] or '').upper().strip() or None) if r['mentor_id'] else None,
                'students_connected_total': r['students_connected_total'],
            }
            if with_phone:
                entry.update({
                    'calls': r['calls'],
                    'connected': r['connected'],
                    'missed': r['missed'],
                    'unknown_outcome': r['unknown_outcome'],
                    'connect_rate': connect_rate(r['connected'], r['calls'], r['unknown_outcome']),
                    'talk_time_sec': r['talk_time_sec'],
                    'avg_duration_sec': round(r['avg_duration_sec']) if r['avg_duration_sec'] is not None else 0,
                    'longest_call_sec': r['longest_call_sec'],
                    'unique_students': r['unique_students'],
                    'phone_connected': r['phone_connected'],
                    'phone_students_connected': r['phone_students_connected'],
                    'incoming_calls': r['incoming_calls'],
                    'incoming_connected': r['incoming_connected'],
                    'incoming_talk_time_sec': r['incoming_talk_time_sec'],
                })
            else:
                entry.update({key: None for key in (
                    'calls', 'connected', 'missed', 'unknown_outcome', 'connect_rate', 'talk_time_sec',
                    'avg_duration_sec', 'longest_call_sec', 'unique_students', 'phone_connected',
                    'phone_students_connected', 'incoming_calls', 'incoming_connected', 'incoming_talk_time_sec')})
            for key in ('wa_connected', 'wa_students_connected', 'wa_calls', 'wa_talk_time_sec'):
                entry[key] = r[key] if with_wa else None
            leaderboard.append(entry)

        # 5. Daily trend on feedback_date (one grouped query; gaps filled over the date range, not over rows)
        day_metrics = {}
        if with_phone:
            pm = phone_metrics(scope.phone_q)
            day_metrics.update(calls=pm['calls'], connected=pm['connected'], talk_time_sec=pm['talk_time_sec'])
        if with_wa:
            day_metrics['wa_connected'] = WA_METRICS['wa_connected']
        per_day = {r['feedback_date']: r for r in
                   scope.combined.values('feedback_date').annotate(**day_metrics).order_by('feedback_date')}
        trend = []
        day = start
        while day <= end:
            r = per_day.get(day) or {}
            point = {'date': day.isoformat(),
                     'calls': nz(r.get('calls')) if with_phone else None,
                     'connected': nz(r.get('connected')) if with_phone else None,
                     'talk_time_sec': nz(r.get('talk_time_sec')) if with_phone else None}
            if with_wa:
                point['wa_connected'] = nz(r.get('wa_connected'))
            trend.append(point)
            day += datetime.timedelta(days=1)

        # 6. Hour of day (India time) from start_time: phone calls only
        per_hour = {
            r['hour']: r for r in
            calls.filter(start_time__isnull=False)
                 .annotate(hour=ExtractHour('start_time', tzinfo=IST))
                 .values('hour').annotate(calls=Count('id'), connected=METRICS['connected']).order_by('hour')
        } if with_phone else {}
        hourly = [{'hour': h,
                   'calls': per_hour[h]['calls'] if h in per_hour else 0,
                   'connected': per_hour[h]['connected'] if h in per_hour else 0} for h in range(24)]

        # 6. Mentor dropdown, limited to the caller's scope
        mentor_options = self._mentor_options(allowed)

        return Response({
            'range': {'start': start.isoformat(), 'end': end.isoformat(), 'tz': 'Asia/Kolkata',
                      'date_field': 'feedback_date'},
            'scope': {'type': 'all' if allowed is None else 'team',
                      'mentor_ids': None if allowed is None else sorted(allowed),
                      'mentor_id': scope.mentor_id},
            'channel': scope.channel,
            'kpis': kpis,
            'status_breakdown': status_breakdown,
            'leaderboard': leaderboard,
            'trend': trend,
            'hourly': hourly,
            'hourly_coverage': ({'with_start_time': k['with_start_time'], 'total': k['calls']} if k
                                else {'with_start_time': 0, 'total': 0}),
            'mentor_options': mentor_options,
        })

    @staticmethod
    def _mentor_options(allowed):
        User = get_user_model()
        if allowed is None:
            # Active mentor-type users plus anyone (admins, teachers...) who has logged a real call or a WhatsApp contact
            callers = StudentFeedback.objects.filter(CALL_Q | WHATSAPP_Q, mentor_id__isnull=False).values('mentor_id')
            qs = User.objects.filter(Q(role__in=MENTOR_OPTION_ROLES, is_active=True) | Q(id__in=callers))
        else:
            qs = User.objects.filter(id__in=allowed)
        qs = qs.distinct().order_by('first_name', 'last_name', 'username')
        return [{'id': u['id'],
                 'name': user_display_name(u['first_name'], u['last_name'], u['username']),
                 'role': str(u['role'] or '').upper().strip() or None}
                for u in qs.values('id', 'first_name', 'last_name', 'username', 'role')]


# ── Call list / CSV ─────────────────────────────────────────────────────────────────────────────────

CSV_HEADERS = ['Date', 'Start time (IST)', 'Channel', 'Mentor', 'Mentor role', 'Student', 'Student phone', 'Batch',
               'Call status', 'Direction', 'Duration (s)', 'Feedback status', 'Feedback', 'Next follow-up',
               'Recording URL']

# Display labels for WhatsApp rows (same wording as the web/mobile logging UI)
_WA_CHAT_LABELS = {'MESSAGE_SENT': 'Message sent', 'CALL_DONE': 'WhatsApp connected',
                   'NO_ANSWER': 'No reply', 'NOT_REACHABLE': 'Not on WhatsApp'}


def _is_whatsapp_row(f):
    return (f.feedback_type or '').upper() == 'WHATSAPP' and not f.mobile_call_id and not f.call_status


def _whatsapp_label(f):
    status = (f.status or '').upper()
    if f.call_direction:
        return 'WhatsApp call' if status == 'CALL_DONE' else 'WhatsApp call: not connected'
    return _WA_CHAT_LABELS.get(status, f.get_status_display())

_PHONE_RE = re.compile(r'^\+?[\d\s\-()]+$')


def _csv_safe(value):
    """Neutralise spreadsheet formula injection in free-text cells (phone numbers like +91... stay as-is)."""
    if value is None:
        return ''
    text = str(value)
    if text and text[0] in ('=', '@', '\t', '\r'):
        return "'" + text
    if text and text[0] in ('+', '-') and not _PHONE_RE.match(text):
        return "'" + text
    return text


def _local_time(dt):
    return timezone.localtime(dt, IST) if dt else None


def _call_row(request, f):
    mentor, student = f.mentor, f.student
    start_local = _local_time(f.start_time)
    is_wa = _is_whatsapp_row(f)
    return {
        'id': f.id,
        'channel': 'WHATSAPP' if is_wa else 'PHONE',
        'whatsapp_label': _whatsapp_label(f) if is_wa else None,
        'feedback_date': f.feedback_date.isoformat() if f.feedback_date else None,
        'start_time': start_local.isoformat() if start_local else None,
        'mentor_id': f.mentor_id,
        'mentor_name': (mentor.get_full_name() or mentor.username) if mentor else DELETED_USER,
        'mentor_role': str(mentor.role or '').upper().strip() if mentor else None,
        'student_id': f.student_id,
        'student_name': f"{student.first_name or ''} {student.last_name or ''}".strip() if student else '',
        'student_phone': (student.mobile if student else '') or f.customer_number or '',
        'batch_name': student.batch.name if student and student.batch_id and student.batch else '',
        'call_status': f.call_status or None,
        'call_direction': f.call_direction or None,
        # Normalised direction: phone rows without one predate incoming logging and are outgoing
        'direction': (f.call_direction or 'OUTGOING') if not is_wa else (f.call_direction or None),
        'call_duration': f.call_duration,
        'status': f.status,
        'status_display': f.get_status_display(),
        'feedback': f.feedback,
        'next_followup_date': f.next_followup_date.isoformat() if f.next_followup_date else None,
        'recording_url': recording_absolute_url(request, f),
    }


class _Echo:
    """File-like object whose write() returns the value, for streaming csv.writer output."""

    def write(self, value):
        return value


class MentorCallListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        scope = build_scope(request)
        start, end = scope.start, scope.end
        # channel=all (default) lists phone calls and WhatsApp logs; phone / whatsapp narrow it.
        # outcome=connected keeps connected contacts only (the "Connected" / "WhatsApp connected" cards).
        # direction=outgoing|incoming narrows the phone calls (optional; absent = both, as before).
        qs = scope.combined
        if parse_outcome(request.query_params) == 'connected':
            qs = qs.filter(scope.connected_q())
        direction = parse_direction(request.query_params)
        if direction:
            qs = qs.filter(direction_q(direction))
        qs = (qs.select_related('student', 'student__batch', 'mentor')
              .order_by('-feedback_date', '-start_time', '-id'))

        if str(request.query_params.get('export') or '').lower() == 'csv':
            return self._csv(request, qs, start, end)

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([_call_row(request, f) for f in page])

    @staticmethod
    def _csv(request, qs, start, end):
        writer = csv.writer(_Echo())

        def rows():
            yield '﻿'  # BOM so Excel opens UTF-8 names correctly
            yield writer.writerow(CSV_HEADERS)
            for f in qs.iterator(chunk_size=500):
                r = _call_row(request, f)
                is_wa = r['channel'] == 'WHATSAPP'
                yield writer.writerow([_csv_safe(v) for v in (
                    r['feedback_date'], r['start_time'][:19].replace('T', ' ') if r['start_time'] else '',
                    'WhatsApp' if is_wa else 'Phone',
                    r['mentor_name'], r['mentor_role'], r['student_name'], r['student_phone'], r['batch_name'],
                    '' if is_wa else (r['call_status'] or 'UNKNOWN'), r['direction'], r['call_duration'],
                    r['whatsapp_label'] if is_wa else r['status_display'],
                    r['feedback'], r['next_followup_date'], r['recording_url'],
                )])

        response = StreamingHttpResponse(rows(), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="mentor_calls_{start}_{end}.csv"'
        return response


# ── Pending students ────────────────────────────────────────────────────────────────────────────────

PENDING_CSV_HEADERS = ['Student', 'Student ID', 'Mobile', 'Mentor', 'Batch', 'Last contact', 'Last connected',
                       'Attempts in range', 'Next follow-up', 'Follow-up overdue']


def _pending_row(s):
    mentor = s.batch.primary_mentor if s.batch_id and s.batch else None
    iso = lambda d: d.isoformat() if d else None   # noqa: E731
    return {
        'student_id': s.id,
        'crm_student_id': s.crm_student_id,
        'student_name': f"{s.first_name or ''} {s.last_name or ''}".strip(),
        'student_phone': s.mobile or '',
        'mentor_id': mentor.id if mentor else None,
        'mentor_name': (mentor.get_full_name() or mentor.username) if mentor else '',
        'batch_id': s.batch_id,
        'batch_name': s.batch.name if s.batch_id and s.batch else '',
        'last_contact_date': iso(s.last_contact_date),
        'last_connected_date': iso(s.last_connected_date),
        'attempts_in_range': s.attempts_in_range,
        'next_followup_date': iso(s.next_followup_date),
        'is_overdue': bool(s.is_overdue),
    }


class MentorPendingStudentsView(APIView):
    """
    GET /api/mentor-call-analytics/pending-students/
    Active students in scope with no connected contact (phone or WhatsApp) in the date range. ?export=csv streams all.
    Same access and filters as the analytics page (build_scope -> allowed_mentor_ids).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        scope = build_scope(request)
        qs = pending_students(scope, request.query_params)

        if str(request.query_params.get('export') or '').lower() == 'csv':
            writer = csv.writer(_Echo())

            def rows():
                yield '﻿'
                yield writer.writerow(PENDING_CSV_HEADERS)
                for s in qs.iterator(chunk_size=500):
                    r = _pending_row(s)
                    yield writer.writerow([_csv_safe(v) for v in (
                        r['student_name'], r['crm_student_id'], r['student_phone'], r['mentor_name'], r['batch_name'],
                        r['last_contact_date'], r['last_connected_date'], r['attempts_in_range'],
                        r['next_followup_date'], 'Yes' if r['is_overdue'] else '',
                    )])

            response = StreamingHttpResponse(rows(), content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = f'attachment; filename="pending_students_{scope.start}_{scope.end}.csv"'
            return response

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([_pending_row(s) for s in page])
