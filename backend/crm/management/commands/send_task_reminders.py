"""
Send "Follow-up due" push notifications for CRM tasks whose due time has arrived.

Meant to run every minute (systemd timer, see deploy/systemd/). Safe to run concurrently:
each task is claimed with a conditional UPDATE before anything is sent, so a task is
pushed at most once per due_date (crm/reminder_signals.py re-arms it when due_date changes).

    python manage.py send_task_reminders            # send
    python manage.py send_task_reminders --dry-run  # list what would be sent, change nothing
"""
import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from crm.models import Task
from notifications.models import DeviceToken, Notification
from notifications.push import is_expo_push_token, send_expo_batch

logger = logging.getLogger(__name__)

DEFAULT_GRACE_MINUTES = 120
DEFAULT_LIMIT = 500
CHANNEL_ID = 'followups'


def due_tasks(now, grace_minutes=DEFAULT_GRACE_MINUTES):
    """PENDING tasks due within [now - grace, now] that have not been reminded yet."""
    return (
        Task.objects.filter(
            status='PENDING',
            reminder_sent_at__isnull=True,
            due_date__isnull=False,
            due_date__lte=now,
            due_date__gte=now - timedelta(minutes=grace_minutes),
        )
        .select_related('assigned_to', 'created_by', 'student', 'student__assigned_to')
        .order_by('due_date', 'pk')
    )


def claim_task(task_id, now):
    """Atomically mark a task as reminded. True only for the caller that actually claimed it."""
    return Task.objects.filter(pk=task_id, reminder_sent_at__isnull=True).update(reminder_sent_at=now) == 1


def reminder_recipient(task):
    """The task's assignee, falling back to the lead's owner."""
    if task.assigned_to_id:
        return task.assigned_to
    if task.student_id and task.student.assigned_to_id:
        return task.student.assigned_to
    return None


def push_tokens_for(user):
    """
    The user's active DeviceTokens. If the user has never registered a DeviceToken
    (older app build), fall back to the legacy User.expo_push_token (read-only).
    De-duplicated, and only well-formed Expo tokens.
    """
    has_any_device = DeviceToken.objects.filter(user=user).exists()
    if has_any_device:
        tokens = DeviceToken.objects.filter(user=user, is_active=True).values_list('token', flat=True)
    else:
        legacy = getattr(user, 'expo_push_token', None)
        tokens = [legacy] if legacy else []
    seen, result = set(), []
    for token in tokens:
        token = (token or '').strip()
        if is_expo_push_token(token) and token not in seen:
            seen.add(token)
            result.append(token)
    return result


def lead_name(task):
    if not task.student_id:
        return ''
    student = task.student
    return f"{student.first_name or ''} {student.last_name or ''}".strip()


def reminder_body(task):
    """'<title> – <lead name>', without repeating the name when the title already has it
    (auto-created follow-ups are titled 'Follow-up: <first> <last>')."""
    title = task.title or ''
    name = lead_name(task)
    if not name or name.casefold() in title.casefold():
        return title
    return f"{title} – {name}"


KIND_FOLLOWUP = 'followup'
KIND_ASSIGNED = 'assigned'
TASKS_PAGE_URL = '/crm/reminders'  # web Reminders page; mobile notifications.tsx maps it to /all-tasks


def task_kind(task):
    """Auto follow-ups from calls vs everything else (source ASSIGNED or null)."""
    return KIND_FOLLOWUP if task.source == Task.SOURCE_AUTO_FOLLOWUP else KIND_ASSIGNED


def user_display_name(user):
    full = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return full or user.username


def assigned_body(task, recipient):
    """'<title> (from <creator>)', without 'from' when the creator is unknown or is the recipient."""
    title = task.title or ''
    creator = task.created_by
    if creator is None or (recipient is not None and creator.pk == recipient.pk):
        return title
    return f"{title} (from {user_display_name(creator)})"


def reminder_content(task, recipient):
    """(kind, title, body) for this task's push and Notification row."""
    kind = task_kind(task)
    if kind == KIND_FOLLOWUP:
        return kind, 'Follow-up due', reminder_body(task)
    return kind, 'Task due', assigned_body(task, recipient)


def notification_target_url(task):
    return f"/sales?student={task.student_id}" if task.student_id else TASKS_PAGE_URL


def build_messages(task, tokens, kind, title, body):
    data = {'type': 'TASK_DUE', 'kind': kind, 'taskId': task.pk, 'leadId': task.student_id}
    return [
        {
            'to': token,
            'title': title,
            'body': body,
            'sound': 'default',
            'channelId': CHANNEL_ID,
            'priority': 'high',
            'data': data,
        }
        for token in tokens
    ]


class Command(BaseCommand):
    help = 'Send "Follow-up due" push notifications for CRM tasks whose due time has arrived.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='List what would be sent; change nothing.')
        parser.add_argument('--grace-minutes', type=int, default=DEFAULT_GRACE_MINUTES,
                            help='Ignore tasks due longer ago than this (default 120).')
        parser.add_argument('--limit', type=int, default=DEFAULT_LIMIT,
                            help='Maximum tasks per run (default 500).')
        parser.add_argument('--skip-mentor-digest', action='store_true',
                            help='Do not send the mentor morning "Student follow-ups" push.')
        parser.add_argument('--mentor-digest-hour', type=int, default=9,
                            help='India hour (0-23) from which the mentor digest is sent (default 9).')

    def run_mentor_digest(self, now, options, dry_run):
        """Mentor morning push (core/mentor_digest.py). Never lets an error affect task reminders."""
        if options.get('skip_mentor_digest'):
            return
        from core.mentor_digest import send_mentor_followup_digests
        try:
            result = send_mentor_followup_digests(
                now=now, dry_run=dry_run, hour=options.get('mentor_digest_hour', 9), write=self.stdout.write,
            )
        except Exception:
            logger.exception('send_task_reminders: mentor digest failed')
            return
        if dry_run:
            self.stdout.write(f"[dry-run] mentor digest: {result['mentors']} mentor(s) would be notified.")
        elif result['mentors'] or options.get('verbosity', 1) >= 2:
            line = (f"mentor_digest mentors={result['mentors']} claimed={result['claimed']} "
                    f"no_device={result['no_device']} pushed={result['pushed']} push_errors={result['push_errors']}")
            if result['claimed']:
                logger.info('send_task_reminders: %s', line)
            self.stdout.write(line)

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        now = timezone.now()
        tasks = list(due_tasks(now, options['grace_minutes'])[:options['limit']])

        messages = []
        claimed = skipped_no_recipient = skipped_no_device = 0

        for task in tasks:
            recipient = reminder_recipient(task)
            tokens = push_tokens_for(recipient) if recipient and recipient.is_active else []
            kind, title, body = reminder_content(task, recipient)

            if dry_run:
                who = recipient.username if recipient else '-'
                self.stdout.write(
                    f"[dry-run] task={task.pk} kind={kind} due={task.due_date.isoformat()} to={who} "
                    f"devices={len(tokens)} title={title!r} body={body!r}"
                )
                continue

            # Claim first, so concurrent/overlapping runs never send the same task twice
            if not claim_task(task.pk, now):
                continue
            claimed += 1

            if recipient is None or not recipient.is_active:
                skipped_no_recipient += 1
                continue

            Notification.objects.create(
                user=recipient,
                title=title,
                message=body,
                notification_type='TASK',
                target_url=notification_target_url(task),
            )

            if not tokens:
                skipped_no_device += 1
                continue
            messages.extend(build_messages(task, tokens, kind, title, body))

        if dry_run:
            self.stdout.write(f"[dry-run] {len(tasks)} task(s) due; nothing was sent or changed.")
            self.run_mentor_digest(now, options, dry_run=True)
            return

        summary = send_expo_batch(messages) if messages else {'sent': 0, 'errors': 0, 'skipped': 0, 'deactivated': 0}
        line = (
            f"due={len(tasks)} claimed={claimed} no_recipient={skipped_no_recipient} "
            f"no_device={skipped_no_device} pushed={summary['sent']} push_errors={summary['errors']} "
            f"deactivated_tokens={summary['deactivated']}"
        )
        # Quiet when nothing was due, so the every-minute timer doesn't flood the journal (-v 2 to always print)
        if tasks or options.get('verbosity', 1) >= 2:
            if tasks:
                logger.info('send_task_reminders: %s', line)
            self.stdout.write(line)

        self.run_mentor_digest(now, options, dry_run=False)
