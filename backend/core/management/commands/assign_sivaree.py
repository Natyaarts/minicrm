from django.core.management.base import BaseCommand
from core.models import Batch
from django.contrib.auth import get_user_model

class Command(BaseCommand):
    help = 'Assign Sivaree to batches'

    def handle(self, *args, **options):
        User = get_user_model()
        
        # Look for mentor with 'siva' in their name
        mentor = User.objects.filter(first_name__icontains='siva', role='MENTOR').first()
        if not mentor:
            self.stdout.write(self.style.ERROR("ERROR: Could not find mentor 'Sivaree' (tried searching 'siva'). Make sure she has an account with the role MENTOR."))
            return
            
        batches = [
            "G 1 OFFLINE BN",
            "G 8 OFFLINE BNS",
            "BN ITEM (OFFLINE)",
            "KALOLSAVAM ITEM (ONLINE)",
            "NATYAPRAVESHIKA OFFLINE",
            "BN ITEM INDIVIDUAL (ONLINE)",
            "SEMI CLASSICAL ONLINE",
            "RESHMA IND ITEM",
            "JIJIMOL ITEM",
            "G 01 CMJ OFFLINE",
            "CMJ OFFLINE G02",
            "WINZA OFFLINE CMS",
            "G 9 OFFLINE BNJ",
            "G 7 OFFLINE BN",
            "G1 OFFLINE KATHAK",
            "G2 OFFLINE KATHAK",
            "ZIVA BASHIR OFFLINE BNJ",
            "G03 OFFLINE KATHAK",
            "G01 NATYAPREVISHKA OFFLINE",
            "G 1 KUCH OFFLINE",
            "INDIAN YOGA MORNING",
            "INDIAN YOGA EVENING",
            "YOGA ABOAD BATCH"
        ]

        def clean_term(term):
            t = term.replace('"', '').strip()
            return t
            
        assigned_count = 0
        missing = []
        
        for term in batches:
            c_term = clean_term(term)
            batch = Batch.objects.filter(name__iexact=c_term).first()
            
            if not batch:
                batch = Batch.objects.filter(name__icontains=c_term).first()
                
            if not batch and '(' in c_term:
                base = c_term.split('(')[0].strip()
                batch = Batch.objects.filter(name__icontains=base).first()

            if batch:
                batch.primary_mentor = mentor
                batch.save()
                assigned_count += 1
                self.stdout.write(f"Assigned {mentor.first_name} to {batch.name}")
            else:
                missing.append(c_term)
                
        self.stdout.write(self.style.SUCCESS(f"\n--- SUMMARY FOR {mentor.first_name} ---"))
        self.stdout.write(self.style.SUCCESS(f"Successfully assigned to {assigned_count} batches."))
        if missing:
            self.stdout.write(self.style.WARNING(f"Could not find batches for these terms:"))
            for m in missing:
                self.stdout.write(self.style.WARNING(f" - {m}"))
        self.stdout.write("------------------------------------------\n")
