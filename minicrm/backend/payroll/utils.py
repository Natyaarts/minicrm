import io
from django.http import HttpResponse
from django.template.loader import get_template
from xhtml2pdf import pisa

def render_to_pdf(template_src, context_dict={}):
    try:
        template = get_template(template_src)
        html = template.render(context_dict)
        result = io.BytesIO()
        pdf = pisa.pisaDocument(io.BytesIO(html.encode("UTF-8")), result)
        if not pdf.err:
            return HttpResponse(result.getvalue(), content_type='application/pdf')
        print(f"PISA ERROR: {pdf.err}")
    except Exception as e:
        print(f"PDF GENERATION EXCEPTION: {str(e)}")
    return None

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

    num_str = str(int(number))
    # This is a very basic implementation, ideally we'd use 'num2words' library 
    # but let's stick to a custom one for now to avoid new dependencies if possible.
    # For Indian numbering system (Lakhs/Crores)
    # 50,387 -> Fifty Thousand Three Hundred Eighty Seven
    
    n = int(number)
    if n < 1000:
        return convert_less_than_thousand(n)
    elif n < 100000:
        return convert_less_than_thousand(n // 1000) + " Thousand " + convert_less_than_thousand(n % 1000)
    elif n < 10000000:
        return convert_less_than_thousand(n // 100000) + " Lakh " + (convert_less_than_thousand((n % 100000) // 1000) + " Thousand " if (n % 100000) // 1000 > 0 else "") + convert_less_than_thousand(n % 1000)
    
    return str(number) # Fallback
