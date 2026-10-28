from django.db import transaction
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

from core.models import Student
from integrations.meta_capi import send_crm_event

# CRM lead_status -> Meta event name. Statuses not listed are not sent.
STATUS_EVENTS = {
    'NEW': 'Lead',
    'FOLLOW_UP': 'Contacted',
    'PAYMENT_PENDING': 'QualifiedLead',
    'ENROLLED': 'Converted',
}
QUALITY_EVENTS = {
    'QUALITY': 'QualityLead',
    'FAKE': 'JunkLead',
}


def _phone(mobile):
    digits = ''.join(ch for ch in (mobile or '') if ch.isdigit())
    if len(digits) == 10:       # Indian number without country code
        digits = '91' + digits
    return digits or None


@receiver(pre_save, sender=Student)
def remember_old_values(sender, instance, **kwargs):
    old = None
    if instance.pk:
        old = (Student.objects.filter(pk=instance.pk)
               .values('lead_status', 'lead_quality').first())
    instance._old_status = old['lead_status'] if old else None
    instance._old_quality = old['lead_quality'] if old else None


@receiver(post_save, sender=Student)
def sync_to_meta(sender, instance, created, **kwargs):
    if not instance.meta_lead_id:       # only leads that came from Meta Lead Ads
        return

    events = []
    if created or instance.lead_status != getattr(instance, '_old_status', None):
        name = STATUS_EVENTS.get(instance.lead_status)
        if name:
            events.append(name)
    if instance.lead_quality != getattr(instance, '_old_quality', None):
        name = QUALITY_EVENTS.get(instance.lead_quality)
        if name:
            events.append(name)

    for name in events:
        transaction.on_commit(lambda n=name: send_crm_event(
            n,
            lead_id=instance.meta_lead_id,
            email=instance.email,
            phone=_phone(instance.mobile),
        ))