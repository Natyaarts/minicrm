from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from core.models import Student, Transaction, Document, Batch
from hrms.models import Task
from leaves.models import LeaveRequest
from .models import Notification

User = get_user_model()

@receiver(post_save, sender=Transaction)
def payment_notification(sender, instance, created, **kwargs):
    if created:
        # Notify Admins and Sales
        targets = User.objects.filter(role__in=['ADMIN', 'SUPER_ADMIN', 'SALES'])
        for user in targets:
            Notification.objects.create(
                user=user,
                title="Payment Received",
                message=f"₹{instance.amount} received from {instance.student.first_name} {instance.student.last_name}.",
                notification_type='PAYMENT',
                target_url=f"/students/{instance.student.crm_student_id}"
            )

@receiver(post_save, sender=Document)
def document_notification(sender, instance, created, **kwargs):
    if created:
        # Notify Admins and Academic staff
        targets = User.objects.filter(role__in=['ADMIN', 'SUPER_ADMIN', 'ACADEMIC'])
        for user in targets:
            Notification.objects.create(
                user=user,
                title="New Document Uploaded",
                message=f"{instance.document_type} uploaded by {instance.student.first_name}.",
                notification_type='INFO',
                target_url=f"/students/{instance.student.crm_student_id}"
            )

@receiver(post_save, sender=Batch)
def batch_update_notification(sender, instance, created, **kwargs):
    """Notify primary mentor when a batch is created and they are assigned."""
    if created and instance.primary_mentor:
        Notification.objects.create(
            user=instance.primary_mentor,
            title="New Batch Assigned",
            message=f"You have been assigned as primary mentor for batch {instance.name}.",
            notification_type='BATCH',
            target_url=f"/academic"
        )

@receiver(post_save, sender=Task)
def task_notification(sender, instance, created, **kwargs):
    if created:
        Notification.objects.create(
            user=instance.assignee.user,
            title="New Task Assigned",
            message=f"You have been assigned a new task: {instance.title}",
            notification_type='TASK',
            target_url="/hrms/tasks"
        )

@receiver(post_save, sender=LeaveRequest)
def leave_notification(sender, instance, created, **kwargs):
    if not created: # On update (approval/rejection)
        status_text = instance.status.replace('_', ' ').title()
        Notification.objects.create(
            user=instance.employee.user,
            title=f"Leave Request {status_text}",
            message=f"Your leave request for {instance.start_date} to {instance.end_date} has been updated to {status_text}.",
            notification_type='LEAVE',
            target_url="/hrms/leaves"
        )
    elif created:
        # Notify Admins and direct reporting manager about new leave request
        recipients = set(User.objects.filter(role__in=['ADMIN', 'SUPER_ADMIN']))
        if instance.employee.reporting_to and instance.employee.reporting_to.user:
            recipients.add(instance.employee.reporting_to.user)
        recipients.discard(instance.employee.user)
        
        emp_name = instance.employee.user.get_full_name() or instance.employee.user.username
        leave_name = instance.leave_type.name if instance.leave_type else "Leave"
        for recipient in recipients:
            Notification.objects.create(
                user=recipient,
                title="New Leave Request",
                message=f"{emp_name} has requested {leave_name} ({instance.start_date} to {instance.end_date}).",
                notification_type='LEAVE',
                target_url="/hrms/leaves"
            )

@receiver(pre_save, sender=Student)
def cache_previous_assignment(sender, instance, **kwargs):
    if instance.pk:
        try:
            old_instance = Student.objects.get(pk=instance.pk)
            instance._old_assigned_to = old_instance.assigned_to
        except Student.DoesNotExist:
            instance._old_assigned_to = None
    else:
        instance._old_assigned_to = None

@receiver(post_save, sender=Student)
def lead_assignment_notification(sender, instance, created, **kwargs):
    old_assigned_to = getattr(instance, '_old_assigned_to', None)
    
    # If a new lead is created with an assignee, or an existing lead is reassigned
    if (created and instance.assigned_to) or (not created and instance.assigned_to and old_assigned_to != instance.assigned_to):
        Notification.objects.create(
            user=instance.assigned_to,
            title="New Lead Assigned",
            message=f"You have been assigned a new lead: {instance.first_name} {instance.last_name}.",
            notification_type='INFO',
            target_url=f"/sales"
        )
