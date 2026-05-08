from django.db.models.signals import post_save
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
        Notification.objects.create(
            user=instance.employee.user,
            title=f"Leave Request {instance.status}",
            message=f"Your leave request for {instance.start_date} has been {instance.status.lower()}.",
            notification_type='LEAVE',
            target_url="/hrms/leaves"
        )
    elif created:
        # Notify Admins about new leave request
        admins = User.objects.filter(role__in=['ADMIN', 'SUPER_ADMIN'])
        for admin in admins:
            Notification.objects.create(
                user=admin,
                title="New Leave Request",
                message=f"{instance.employee.user.get_full_name()} has requested leave.",
                notification_type='LEAVE',
                target_url="/hrms/leaves"
            )
