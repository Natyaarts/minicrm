from decimal import Decimal

def calculate_monthly_tds(employee, monthly_gross, financial_year='2026-2027'):
    """
    Calculates monthly TDS for an employee based on their salary structure, regime choice, 
    and approved tax declarations.
    """
    from payroll.models import TaxDeclaration
    
    # Get active salary structure
    try:
        struct = employee.salary_structure
    except Exception:
        return Decimal('0.00')
        
    # Estimate annual gross salary based on the monthly gross
    annual_gross = monthly_gross * Decimal('12.00')
    
    # Determine the regime. Default to what is configured in structure.
    regime = struct.tax_regime
    
    # Check if there is an approved tax declaration for this financial year
    declaration = TaxDeclaration.objects.filter(employee=employee, financial_year=financial_year, status='APPROVED').first()
    if declaration:
        regime = declaration.regime
        
    if regime == 'NEW':
        # New Regime Rules:
        # Standard deduction: 75,000 for FY 2025-26/2026-27
        std_deduction = Decimal('75000.00')
        net_taxable = max(Decimal('0.00'), annual_gross - std_deduction)
        
        # Calculate tax slabs
        # Slabs for FY 2025-26 / 2026-27:
        # up to 3L: 0
        # 3L to 7L: 5%
        # 7L to 10L: 10%
        # 10L to 12L: 15%
        # 12L to 15L: 20%
        # above 15L: 30%
        tax = Decimal('0.00')
        
        if net_taxable <= Decimal('700000.00'):
            # Rebate under Sec 87A: Tax is fully rebated up to 7L in net taxable income
            return Decimal('0.00')
            
        remaining = net_taxable
        
        # 3L - 7L (4L width @ 5%)
        if remaining > Decimal('300000.00'):
            slab_taxable = min(remaining - Decimal('300000.00'), Decimal('400000.00'))
            tax += slab_taxable * Decimal('0.05')
            
        # 7L - 10L (3L width @ 10%)
        if remaining > Decimal('700000.00'):
            slab_taxable = min(remaining - Decimal('700000.00'), Decimal('300000.00'))
            tax += slab_taxable * Decimal('0.10')
            
        # 10L - 12L (2L width @ 15%)
        if remaining > Decimal('1000000.00'):
            slab_taxable = min(remaining - Decimal('1000000.00'), Decimal('200000.00'))
            tax += slab_taxable * Decimal('0.15')
            
        # 12L - 15L (3L width @ 20%)
        if remaining > Decimal('1200000.00'):
            slab_taxable = min(remaining - Decimal('1200000.00'), Decimal('300000.00'))
            tax += slab_taxable * Decimal('0.20')
            
        # above 15L (@ 30%)
        if remaining > Decimal('1500000.00'):
            slab_taxable = remaining - Decimal('1500000.00')
            tax += slab_taxable * Decimal('0.30')
            
    else:
        # Old Regime Rules:
        # Standard deduction: 50,000
        std_deduction = Decimal('50000.00')
        
        # Exemption calculations
        sec_80c = Decimal('0.00')
        sec_80d = Decimal('0.00')
        sec_24b = Decimal('0.00')
        sec_80ccd_1b = Decimal('0.00')
        other_ded = Decimal('0.00')
        hra_exemption = Decimal('0.00')
        
        if declaration:
            sec_80c = min(declaration.sec_80c, Decimal('150000.00')) # Cap at 1.5L
            sec_80d = min(declaration.sec_80d, Decimal('25000.00'))  # General Cap
            sec_24b = min(declaration.sec_24b, Decimal('200000.00')) # Cap at 2L
            sec_80ccd_1b = min(declaration.sec_80ccd_1b, Decimal('50000.00')) # NPS cap
            other_ded = declaration.sec_80e + declaration.sec_80g + declaration.sec_80tta
            
            # Simple HRA exemption logic: HRA is exempt minimum of:
            # 1. HRA allowance received annually
            # 2. Rent paid annually - 10% of annual basic
            # 3. 40% of basic (assuming non-metro for Kerala)
            annual_basic = struct.base_salary * Decimal('12.00')
            annual_hra = struct.hra * Decimal('12.00')
            if declaration.annual_rent > 0 and annual_basic > 0:
                rent_minus_10_basic = max(Decimal('0.00'), declaration.annual_rent - (annual_basic * Decimal('0.10')))
                exempt_40_percent = annual_basic * Decimal('0.40')
                hra_exemption = min(annual_hra, rent_minus_10_basic, exempt_40_percent)
        
        total_exemptions = std_deduction + sec_80c + sec_80d + sec_24b + sec_80ccd_1b + other_ded + hra_exemption
        net_taxable = max(Decimal('0.00'), annual_gross - total_exemptions)
        
        # Calculate old regime tax
        # Slabs:
        # up to 2.5L: 0
        # 2.5L to 5L: 5%
        # 5L to 10L: 20%
        # above 10L: 30%
        tax = Decimal('0.00')
        
        if net_taxable <= Decimal('500000.00'):
            # Rebate under Sec 87A: Tax is fully rebated up to 5L net taxable
            return Decimal('0.00')
            
        remaining = net_taxable
        
        # 2.5L - 5L (2.5L width @ 5%)
        if remaining > Decimal('250000.00'):
            slab_taxable = min(remaining - Decimal('250000.00'), Decimal('250000.00'))
            tax += slab_taxable * Decimal('0.05')
            
        # 5L - 10L (5L width @ 20%)
        if remaining > Decimal('500000.00'):
            slab_taxable = min(remaining - Decimal('500000.00'), Decimal('500000.00'))
            tax += slab_taxable * Decimal('0.20')
            
        # above 10L (@ 30%)
        if remaining > Decimal('1000000.00'):
            slab_taxable = remaining - Decimal('1000000.00')
            tax += slab_taxable * Decimal('0.30')
            
    # Add Education & Health Cess (4%)
    cess = tax * Decimal('0.04')
    total_annual_tax = tax + cess
    
    # Monthly TDS
    monthly_tds = (total_annual_tax / Decimal('12.00')).quantize(Decimal('0.01'))
    return monthly_tds
