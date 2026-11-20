"""
Follow-up reminder bookkeeping for crm.Task.

When a task's due_date changes, its "Follow-up due" push must fire again at the new time,
so reminder_sent_at is cleared. Registered from CrmConfig.ready().

Queryset .update() calls (e.g. the claim in send_task_reminders) do not fire this signal.
"""
from datetime import datetime

from django.db.models.signals import pre_save
from django.dispatch import receiver
from django.utils import timezone

from crm.models import Task


def _normalise_due(value):
    """Return due_date as an aware datetime (or None), whatever form it was assigned in."""
    if value is None or value == '':
        return None
    if not isinstance(value, datetime):
        value = Task._meta.get_field('due_date').to_python(value)
        if value is None:
            return None
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_default_timezone())
    return value


@receiver(pre_save, sender=Task, dispatch_uid='crm_task_reset_reminder_on_due_change')
def reset_reminder_on_due_date_change(sender, instance, raw=False, update_fields=None, **kwargs):
    if raw or not instance.pk:
        return  # fixture load, or a brand-new task (nothing sent yet)
    if update_fields is not None and 'due_date' not in update_fields:
        return  # this save cannot change due_date

    old = Task.objects.filter(pk=instance.pk).values_list('due_date', 'reminder_sent_at').first()
    if old is None:
        return
    old_due, old_sent = old
    if old_sent is None and instance.reminder_sent_at is None:
        return  # nothing to reset

    try:
        new_due = _normalise_due(instance.due_date)
    except Exception:
        return  # invalid value: let the normal save/validation path report it
    if new_due == old_due:
        return

    instance.reminder_sent_at = None
    if update_fields is not None and 'reminder_sent_at' not in update_fields:
        # save(update_fields=[...'due_date'...]) would not write the cleared value, so clear it directly
        Task.objects.filter(pk=instance.pk).update(reminder_sent_at=None)
