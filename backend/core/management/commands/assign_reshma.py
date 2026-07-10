from django.core.management.base import BaseCommand
from core.models import Batch
from users.models import User

class Command(BaseCommand):
    help = 'Assign Reshma to her specific batches'

    def handle(self, *args, **options):
        try:
            reshma = User.objects.get(email='reshmaik19995@gmail.com')
            self.stdout.write(self.style.SUCCESS(f"Found mentor: {reshma.get_full_name()}"))
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR("Reshma not found! Please check the email address."))
            return

        raw_list = [
            "G 160 BNS", "178",
            "G 217 BNJ", "G 218 BNJ",
            "G 236 BNS",
            "G 186 BNS", 
            "G 238 BNS",
            "G 91 BNJ",
            "G 216 BNS",
            "G 247 BNS",
            "G 71 BNJ",
            "G 150 BNJ",
            "G 167 BNS",
            "G 134 BNS",
            "G 138 BNS",
            "G 113 BNS",
            "G 207 BNS",
            "G 52 BNJ",
            "NAT 8",
            "NAT 4",
            "G 74 BNJ",
            "G 230 BNJ",
            "G 239 BNS",
            "G 240 BNJ",
            "G 220 BNS", "G 222 BNS",
            "G 234 BNS", "235 BNS",
            "G 241 BNS",
            "G 242 BNS",
            "G 83 BNS",
            "G 210 BNS", "G 204 BNS",
            "G 118 BNS",
            "G 237 BNS",
            "G 246 BNS",
            "G 232", "233 BNS",
            "G 245 BNS"
        ]

        assigned_count = 0
        not_found = []

        for item in raw_list:
            search_term = item.strip().split('(')[0].strip() # Clean up things like "(w/2)"
            
            # Try exact match first, then icontains
            batches = Batch.objects.filter(name__icontains=search_term)
            
            if batches.exists():
                for b in batches:
                    b.primary_mentor = reshma
                    b.save()
                    assigned_count += 1
                    self.stdout.write(f"Assigned {reshma.get_full_name()} to {b.name}")
            else:
                not_found.append(search_term)

        self.stdout.write(self.style.SUCCESS(f"\n--- SUMMARY ---"))
        self.stdout.write(self.style.SUCCESS(f"Successfully assigned to {assigned_count} batches."))
        if not_found:
            self.stdout.write(self.style.WARNING("Could not find batches for these terms:"))
            for nf in not_found:
                self.stdout.write(self.style.WARNING(f" - {nf}"))
