"""
Mentor follow-ups: the next_followup_date on each student's LATEST StudentFeedback.

Only the latest feedback counts (same ordering as the student list annotation in
core/views.py StudentViewSet.get_queryset), so logging a newer feedback - by anyone - replaces
the old follow-up. Used by GET /students/my_followups/ and crm send_task_reminders
(mentor morning push).
"""
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.db.models import OuterRef, Subquery
from django.utils import timezone

from .models import Student, StudentFeedback

IST = ZoneInfo('Asia/Kolkata')
DEFAULT_DAYS = 7
MAX_DAYS = 30
MENTOR_FOLLOWUP_NOTE_CHARS = 120  # last-feedback note length in the my_followups response


def ist_today():
    """Today's date in India (the project TIME_ZONE is UTC, so timezone.localdate() lags until 05:30 IST)."""
    return timezone.localdate(timezone=IST)


def students_with_followups():
    """
    Students annotated with their latest feedback: fu_id, fu_mentor_id, fu_date
    (fu_date = that feedback's next_followup_date). Only students whose latest feedback has one.
    Single query (correlated subqueries), no N+1.
    """
    latest = StudentFeedback.objects.filter(student=OuterRef('pk')).order_by('-feedback_date', '-id')
    return (
        Student.objects
        .annotate(
            fu_id=Subquery(latest.values('id')[:1]),
            fu_mentor_id=Subquery(latest.values('mentor_id')[:1]),
            fu_date=Subquery(latest.values('next_followup_date')[:1]),
        )
        .filter(fu_date__isnull=False)
    )


def followups_for_mentor(user, today=None, days=DEFAULT_DAYS):
    """The user's follow-ups that are overdue or due within `days` days, soonest (overdue) first."""
    today = today or ist_today()
    return (
        students_with_followups()
        .filter(fu_mentor_id=user.pk, fu_date__lte=today + timedelta(days=days))
        .order_by('fu_date', 'id')
    )


def clamp_days(raw, default=DEFAULT_DAYS):
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(0, min(value, MAX_DAYS))
