"""
READ-ONLY. Lists PENDING manually-created CRM tasks whose due time may be 5h30 off.

Before the CRMTasks.jsx fix, the web Reminders form sent a naive "YYYY-MM-DDTHH:MM" value,
which the server (TIME_ZONE='UTC') stored as UTC. An IST user's 15:30 was saved as 15:30 UTC
(= 21:00 IST). Mobile follow-ups were always correct, so only ASSIGNED / null-source tasks
are listed. Nothing is changed; review the list and fix rows by hand if needed.

    python manage.py list_suspect_task_times
    python manage.py list_suspect_task_times --before "2026-11-20 18:00"   # created before the fix deploy (IST)
    python manage.py list_suspect_task_times --include-past
"""
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from crm.models import Task

IST = ZoneInfo('Asia/Kolkata')
IST_OFFSET = timedelta(hours=5, minutes=30)


def _name(user):
    if user is None:
        return '-'
    full = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return full or user.username


def _ist(value):
    return timezone.localtime(value, IST).strftime('%Y-%m-%d %H:%M IST') if value else '-'


class Command(BaseCommand):
    help = 'READ-ONLY: list PENDING web-created CRM tasks whose due time may have been saved 5h30 late.'

    def add_arguments(self, parser):
        parser.add_argument('--before', help='Only tasks created before this time (IST), e.g. "2026-11-20 18:00".')
        parser.add_argument('--include-past', action='store_true',
                            help='Also list tasks whose (stored) due time has already passed.')

    def handle(self, *args, **options):
        qs = (
            Task.objects.filter(status='PENDING', due_date__isnull=False)
            .filter(Q(source__isnull=True) | Q(source=Task.SOURCE_ASSIGNED))
            .select_related('assigned_to', 'created_by', 'student')
            .order_by('due_date', 'pk')
        )
        if options['before']:
            before = parse_datetime(options['before'].replace(' ', 'T'))
            if before is None:
                raise CommandError('--before must look like "YYYY-MM-DD HH:MM"')
            if timezone.is_naive(before):
                before = timezone.make_aware(before, IST)
            qs = qs.filter(created_at__lt=before)
        if not options['include_past']:
            qs = qs.filter(due_date__gte=timezone.now())

        rows = list(qs)
        self.stdout.write(
            f"{'id':>6}  {'title':<40}  {'assigned_to':<20}  {'created_by':<20}  "
            f"{'stored due (IST)':<22}  {'probably meant (IST)':<22}  lead"
        )
        for task in rows:
            lead = f"{task.student.first_name} {task.student.last_name}".strip() if task.student_id else '-'
            self.stdout.write(
                f"{task.pk:>6}  {(task.title or '')[:40]:<40}  {_name(task.assigned_to)[:20]:<20}  "
                f"{_name(task.created_by)[:20]:<20}  {_ist(task.due_date):<22}  "
                f"{_ist(task.due_date - IST_OFFSET):<22}  {lead}"
            )
        self.stdout.write(f"{len(rows)} task(s). Read-only: nothing was changed.")
