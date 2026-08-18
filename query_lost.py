import os
import sys
import django

# Set up django
sys.path.append(r'/home/ubuntu/minicrm/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
try:
    django.setup()
except Exception:
    # Fallback to local windows path if run locally
    sys.path.append(r'c:\Users\91811\OneDrive\Desktop\Natya Aug\minicrm\backend')
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()

from crm.models import Student, Campaign, PipelineStage

campaign = Campaign.objects.filter(name__icontains='meta morph').first()
if campaign:
    print(f"Campaign: {campaign.name} (ID: {campaign.id})")
    students = Student.objects.filter(campaign=campaign, is_active=True)
    
    # Replicate view logic for lost_stages
    lost_stages = ['DROPPED', 'dropped', 'Dropped', 'BUSY', 'busy', 'Busy', 'NOT_ANSWERING', 'not_answering', 'Not Answering', 'NOT ANSWERING', 'Not Answered', 'DUPLICATE', 'duplicate']
    
    matching_stages_info = []
    try:
        for stage in PipelineStage.objects.filter(name__icontains='drop') | PipelineStage.objects.filter(name__icontains='busy') | PipelineStage.objects.filter(name__icontains='not answer') | PipelineStage.objects.filter(name__icontains='lost'):
            lost_stages.append(str(stage.id))
            if stage.name:
                lost_stages.append(stage.name)
                matching_stages_info.append(f"{stage.name} (ID: {stage.id})")
    except Exception as e:
        print(f"Error resolving stages: {e}")
        
    print("\nResolved 'Lost / Junk' Stages:")
    print("Hardcoded names:", ['DROPPED', 'dropped', 'Dropped', 'BUSY', 'busy', 'Busy', 'NOT_ANSWERING', 'not_answering', 'Not Answering', 'NOT ANSWERING', 'Not Answered', 'DUPLICATE', 'duplicate'])
    print("Dynamically matched from database:", matching_stages_info)
    
    # Calculate counts
    print("\nBreakdown of 117/118 Lost/Junk Leads by Stage:")
    stages_map = {str(stage.id): stage.name for stage in PipelineStage.objects.all()}
    
    from django.db.models import Count
    counts = students.filter(lead_status__in=lost_stages).values('lead_status').annotate(total=Count('id')).order_by('-total')
    
    total_calculated = 0
    for item in counts:
        status_id = item['lead_status']
        status_name = stages_map.get(str(status_id), status_id)
        print(f"  - {status_name} (ID: {status_id}): {item['total']} leads")
        total_calculated += item['total']
        
    print(f"\nTotal Lost/Junk leads: {total_calculated}")
else:
    print("Campaign not found")
