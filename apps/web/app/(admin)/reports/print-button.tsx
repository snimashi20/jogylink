'use client';

import { Button } from '@jogylink/ui';

/**
 * "Save as PDF" uses the browser's print dialog (choose "Save as PDF" as the printer). The page
 * hides the menu and controls when printing. A server-made PDF file is a possible later upgrade.
 */
export function PrintButton() {
  return (
    <div className="print:hidden">
      <Button variant="secondary" onClick={() => window.print()}>
        Print or save as PDF
      </Button>
    </div>
  );
}
