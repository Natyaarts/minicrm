
from django.db import transaction
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

from core.models import Student
from crm.services.meta_capi import queue_meta_event
import uuid


STATUS_EVENTS = {
    "FOLLOW_UP": "Contacted",
    "PAYMENT_PENDING": "QualifiedLead",
}

QUALITY_EVENTS = {
    "QUALITY": "QualityLead",
    "FAKE": "JunkLead",
}


@receiver(pre_save, sender=Student)
def remember_old_values(sender, instance, **kwargs):
    old = None

    if instance.pk:
        old = (
            Student.objects.filter(pk=instance.pk)
            .values("lead_status", "lead_quality")
            .first()
        )

    instance._old_status = old["lead_status"] if old else None
    instance._old_quality = old["lead_quality"] if old else None


@receiver(post_save, sender=Student)
def sync_to_meta(sender, instance, created, **kwargs):
    if not instance.meta_lead_id:
        return

    events = []

    # Lead creation: use the same key as perform_create()
    if created:
        events.append(
            ("Lead", f"lead:student:{instance.pk}")
        )

    # Only send events for actual status changes
    elif instance.lead_status != getattr(instance, "_old_status", None):
        name = STATUS_EVENTS.get(instance.lead_status)
        if name:
            events.append((
                name,
                f"status:student:{instance.pk}:{uuid.uuid4()}",
            ))

    # Only send events for actual quality changes
    if instance.lead_quality != getattr(instance, "_old_quality", None):
        name = QUALITY_EVENTS.get(instance.lead_quality)
        if name:
            events.append((
                name,
                f"quality:student:{instance.pk}:{uuid.uuid4()}",
            ))

    for event_name, idempotency_key in events:
        transaction.on_commit(
            lambda name=event_name, key=idempotency_key: queue_meta_event(
                student=instance,
                event_name=name,
                action_source="other",
                idempotency_key=key,
            )
        )
