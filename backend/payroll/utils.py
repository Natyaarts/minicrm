import io
from django.http import HttpResponse
from fpdf import FPDF

class PayslipPDF(FPDF):
    def header(self):
        # Company Name
        self.set_font('Helvetica', 'B', 20)
        self.set_text_color(15, 23, 42)
        self.cell(0, 10, 'NATYA ERP', ln=True, align='C')
        
        # Company Address
        self.set_font('Helvetica', '', 8)
        self.set_text_color(100, 116, 139)
        self.cell(0, 5, 'SG Arcade, KT Gopalan Rd, Kottooli, Kozhikode, Kerala 673016', ln=True, align='C')
        
        self.ln(5)
        self.set_draw_color(226, 232, 240)
        self.line(20, 30, 190, 30)
        self.ln(10)

def render_to_pdf(template_src, context):
    """
    Generate Payslip PDF using fpdf2 for high reliability on cloud servers.
    We ignore template_src and use context to build the PDF programmatically.
    """
    p = context.get('payslip')
    emp = context.get('employee')
    
    pdf = PayslipPDF()
    pdf.add_page()
    
    # Title
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 10, f"PAYSLIP FOR {context['month_name'].upper()} {context['year']}", ln=True, align='C')
    pdf.ln(5)
    
    # Employee Info Table
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_fill_color(248, 250, 252)
    
    # Row 1
    pdf.set_text_color(148, 163, 184)
    pdf.cell(40, 8, "Employee Name:", border=0)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(55, 8, str(emp.get('full_name')), border=0)
    
    pdf.set_text_color(148, 163, 184)
    pdf.cell(40, 8, "Employee ID:", border=0)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(55, 8, str(p.employee.employee_id), border=0, ln=True)
    
    # Row 2
    pdf.set_text_color(148, 163, 184)
    pdf.cell(40, 8, "Department:", border=0)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(55, 8, str(emp.get('department_name')), border=0)
    
    pdf.set_text_color(148, 163, 184)
    pdf.cell(40, 8, "Designation:", border=0)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(55, 8, str(emp.get('designation_name')), border=0, ln=True)
    
    # Row 3
    pdf.set_text_color(148, 163, 184)
    pdf.cell(40, 8, "Working Days:", border=0)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(55, 8, str(p.total_working_days), border=0)
    
    pdf.set_text_color(148, 163, 184)
    pdf.cell(40, 8, "Paid Days:", border=0)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(55, 8, str(p.paid_days), border=0, ln=True)
    
    pdf.ln(10)
    
    # Salary Details Table
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(95, 10, " EARNINGS", border=1, fill=True)
    pdf.cell(95, 10, " DEDUCTIONS", border=1, fill=True, ln=True)
    
    pdf.set_font('Helvetica', '', 10)
    pdf.set_text_color(30, 41, 59)
    
    # Row 1
    pdf.cell(65, 10, "Basic Salary", border='LB')
    pdf.cell(30, 10, f"Rs.{p.basic_pay:.2f}", border='RB', align='R')
    pdf.cell(65, 10, "LOP Deduction", border='B')
    pdf.cell(30, 10, f"Rs.{p.lop_deduction:.2f}", border='RB', align='R', ln=True)
    
    # Row 2
    pdf.cell(65, 10, "Allowances", border='LB')
    pdf.cell(30, 10, f"Rs.{p.total_allowances:.2f}", border='RB', align='R')
    pdf.cell(65, 10, "Loan Repayment", border='B')
    pdf.cell(30, 10, f"Rs.{p.loan_deduction:.2f}", border='RB', align='R', ln=True)
    
    # Totals Row
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_fill_color(241, 245, 249)
    pdf.cell(65, 10, "Total Earnings", border=1, fill=True)
    pdf.cell(30, 10, f"Rs.{context['gross_salary']:.2f}", border=1, fill=True, align='R')
    pdf.cell(65, 10, "Total Deductions", border=1, fill=True)
    pdf.cell(30, 10, f"Rs.{p.total_deductions:.2f}", border=1, fill=True, align='R', ln=True)
    
    pdf.ln(15)
    
    # Net Salary Box
    pdf.set_fill_color(15, 23, 42)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Helvetica', 'B', 10)
    pdf.cell(0, 8, "NET TAKE HOME PAY", border=0, fill=True, align='C', ln=True)
    pdf.set_font('Helvetica', 'B', 20)
    pdf.cell(0, 15, f"Rs.{p.net_salary:.2f}", border=0, fill=True, align='C', ln=True)
    pdf.set_font('Helvetica', '', 8)
    pdf.cell(0, 8, f"{context['net_in_words'].upper()} ONLY", border=0, fill=True, align='C', ln=True)
    
    pdf.ln(20)
    pdf.set_text_color(148, 163, 184)
    pdf.set_font('Helvetica', '', 8)
    pdf.cell(0, 5, "This is a computer-generated document and does not require a signature.", ln=True, align='C')
    pdf.cell(0, 5, f"Generated on {context['current_date']}", ln=True, align='C')

    return HttpResponse(pdf.output(), content_type='application/pdf')

def number_to_words(number):
    """Simple number to words converter for currency"""
    units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]
    teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    
    if number == 0: return "Zero"
    
    def convert_less_than_thousand(n):
        res = ""
        if n >= 100:
            res += units[n // 100] + " Hundred "
            n %= 100
        if n >= 20:
            res += tens[n // 10] + " "
            n %= 10
        if n >= 10:
            res += teens[n - 10] + " "
            n = 0
        if n > 0:
            res += units[n] + " "
        return res.strip()

    n = int(number)
    if n < 1000:
        return convert_less_than_thousand(n)
    elif n < 100000:
        return convert_less_than_thousand(n // 1000) + " Thousand " + convert_less_than_thousand(n % 1000)
    elif n < 10000000:
        return convert_less_than_thousand(n // 100000) + " Lakh " + (convert_less_than_thousand((n % 100000) // 1000) + " Thousand " if (n % 100000) // 1000 > 0 else "") + convert_less_than_thousand(n % 1000)
    
    return str(number)
