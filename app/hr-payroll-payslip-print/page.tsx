'use client';

import { useEffect } from 'react';

/** Payslip print from pay runs is temporarily disabled. */
export default function PayslipPrintPage() {
  useEffect(() => {
    document.title = 'Payslip printing unavailable';
  }, []);

  return (
    <main className="mx-auto max-w-lg p-8 text-center text-sm text-muted-foreground">
      Payslip printing from pay runs is temporarily unavailable. Use payroll preview export instead.
    </main>
  );
}
