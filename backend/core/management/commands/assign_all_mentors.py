from django.core.management.base import BaseCommand
from core.models import Batch
from django.contrib.auth import get_user_model
from django.db.models import Q

class Command(BaseCommand):
    help = 'Assign all remaining Mentors to their batches and individual students'

    def handle(self, *args, **options):
        User = get_user_model()
        data = {
            "Priyanka": [
                "G 51 CMS", "G 53 CMS", "G 10 CMS", "G 70 CMJ AB", "G 118 CMS", "G 74 CMS", "G 110 CMS", "G 149 CMS", 
                "G 29 CMJ", "G 101 CMJ", "G 88 CMS", "G 35 CMS", "G 29 CMS", "G 143 CMS", "G 105 CMS", "G 145 CMS", 
                "G 147 CMS", "G 111 CMS", "G 89 S AB", "G 148 CMS", "G 45 CMS", "G 134 CMS", "G 79 CMJ", "G 16 J", 
                "G 87 AB S", "G 84 CMS", "G 34 CMS", "G 25 CMJ",
                "Thara Karunakaran", "Sherly C George", "Dr .B Vijaya", "MUHAMMED SHAFI", "Zerah"
            ],
            "Reshma": [ 
                "Parneita Prasoon", "Tanvi Shree K", "shynu manoj", "Renuka Ravi", " SOUMYA", "Jenelia Jinex", 
                "SANDHYA", "Elset Thomas", "NITHYA R", "Smitha", "DRISYA KS (BN NP)", "Sandhya", "Thara Karunakaran", 
                "Anupama Kudamaloorsseril Reghunath", "Sukanya Jayanth", "Akhila Anoop", "Shivadarshana", 
                "Devu john (NP)", "Anjaly Jayan", "Nileena S Babu", "merin sara sojan", "P Dhanvita", "Johana kevin", 
                "Anju Girija Sivarajan", "Sainandana.D.Pillai", "Akshatha R Bibin", "Julie Anna Joseph", "Chippy prasad", 
                "Anu Xavier"
            ],
            "Anjali": [
                "G 89 BNS", "G 2 MOH JUN", "G 10 KUCH", "G 7 KUCH", "G 9 KUCH AB", "G 116 BNS AB", "G 78 BNS", 
                "G 75 BNJ", "G 76 BNJ (2/W)", "G 11 KUCH", "G 157 BNS", "G 161 BNJ AB", "G 92 BNJ AB", "G 169 BNJ A", 
                "G 181 BNS", "G 89 BNJ", "G 85 BNJ AB", "G 81 BNS", "G 4 KUCH", "G 10 MOH", "G 152 BNJ AB", "G 6 KUCH", 
                "G 8 MOH", "G 12 KUCH", "G 192 BNS", "G 193 BNJ I", "G 194 BNJ A", "G 191 REC+LIVE BN", 
                "G 196 REC + LIVE MOH", "REC + LIVE KUCH", "G 5 MOH SEN", "G 9 MOH", "G 9 MOH AB", "G 243 BNS", 
                "G 243 BNS AB", "G 244 BNS", "244 BNS AB", "KUCH ITEM", "G 26 MOH SEN A", "G 206 BNS A", "G 213 BNS I", 
                "G 226 BNS I", "G 17 MOH S", "G 80 BNJ", "G 164 BNJ", "G 16 MOH S", "G 214 BN I", "G 215 BN A",
                "Viji Syra Varghese", "Sruthi S", "Reshma Roy", "Deethya", "Dhyana Devi", "Sreelakshmi", "Reshma Mohan", 
                "Anusree", "Anupama S", "Sruthi Sedhumadavan", "Veda Gayathri", "Neha Balu M V", "Erin Minto", "Sindhu", 
                "Ramya K", "Aleena Mariya Baby", "Devi Prasanna", "Dr deepthi Alice philp", "Neeraja G Nair", 
                "Ahana Mariyam Bibin"
            ],
            "Athulya": [
                "G 30 CMS", "G 11 CMS", "G 43 CMS", "G 136 CMS", "G 12 CMJ", "G 139 CMS", "G 138 CMS", "G 140 CMS", 
                "G 130 CMS", "G 144 CMJ", "G 115 CMS", "G 117 CMJ", "G 44 CMS", "G 113 CMS", "G 19 CMJ", "G 106 CMS", 
                "G 116 CMS", "G 108 CMJ", "G 49 CMS", "G 146 CMS", "G 112 CMS", "G 18 CMS", "G 91 CMJ", "G 120 CMS", 
                "G 137 CMS", "Aaren Vargheese", "Dhyana Devi.N.K.", "Isha Sooraj", "Anupama Manikandan", "Prajini",
                "CHENDA G 1", "CHENDA G 3", "CHENDA G 5", "Jisha M"
            ]
        }

        def clean_term(term):
            t = term.replace('"', '').strip()
            return t

        for mentor_name, terms in data.items():
            mentor = User.objects.filter(first_name__icontains=mentor_name, role='MENTOR').first()
            if not mentor:
                self.stdout.write(self.style.ERROR(f"ERROR: Could not find mentor {mentor_name}"))
                continue
            
            assigned_count = 0
            missing = []
            
            for term in terms:
                c_term = clean_term(term)
                batch = Batch.objects.filter(name__iexact=c_term).first()
                
                if not batch:
                    batch = Batch.objects.filter(name__icontains=c_term).first()
                    
                if not batch and '&' in c_term:
                    parts = c_term.split('&')
                    batch = Batch.objects.filter(name__icontains=parts[0].strip()).first()
                    
                if not batch and '/' in c_term:
                    parts = c_term.split('/')
                    batch = Batch.objects.filter(name__icontains=parts[0].strip()).first()

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
            self.stdout.write(self.style.SUCCESS(f"Successfully assigned to {assigned_count} batches/individuals."))
            if missing:
                self.stdout.write(self.style.WARNING(f"Could not find batches for these terms:"))
                for m in missing:
                    self.stdout.write(self.style.WARNING(f" - {m}"))
            self.stdout.write("------------------------------------------\n")
