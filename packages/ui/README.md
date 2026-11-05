# packages/ui — shared components (C1–C24)

Built on Tailwind CSS and shadcn/ui. Everyone builds three in week 1; after that, use them —
do not build your own button.

| ID | Component | Owner | ID | Component | Owner |
|---|---|---|---|---|---|
| C1 | Button | M1 | C13 | Offline Banner | M6 |
| C2 | Status Chip | M2 | C14 | Photo Capture | M7 |
| C3 | Money Display | M5 | C15 | Signature Reminder | M7 |
| C4 | Balance Banner | M5 | C16 | Search Bar | M2 |
| C5 | Product Row | M5 | C17 | Filter Chips | M2 |
| C6 | Data Table | M4 | C18 | Product Card | M8 |
| C7 | Metric Card | M3 | C19 | Order Tracker | M8 |
| C8 | Alert Panel | M3 | C20 | Quantity Stepper | M4 |
| C9 | Form Field | M1 | C21 | Supplier Call Card | M3 |
| C10 | Modal | M1 | C22 | Side Navigation | M4 |
| C11 | Toast | M6 | C23 | Breadcrumb | M8 |
| C12 | Empty State | M7 | C24 | Loading Skeleton | M6 |

## Design tokens

```css
:root {
  /* Brand — KFC-style quick-service palette */
  --bucket-red:     #E4002B;  /* brand only: header, primary button, logo */
  --deep-red:       #A1001E;  /* hover, pressed, small red text */
  --charcoal:       #231F20;  /* nav, table headers, body text */
  --cream:          #F5F0E8;  /* page background */
  --golden-crumb:   #F2A900;  /* secondary accent, website CTAs */

  /* Status — fixed meanings, never decorative */
  --fresh-green:    #2E7D4F;  /* safe / paid */
  --watch-amber:    #E8B931;  /* watch / pending */
  --act-orange:     #E07B39;  /* act now / low */
  --danger-crimson: #8B0010;  /* blocked / overdue — DARKER than brand red */
  --info-blue:      #2F6F9F;
}
```

## Two rules that are easy to get wrong

**The two reds.** Brand red `#E4002B` is bright and means "this is Jogy". Alarm red `#8B0010` is
dark and means "stop". They never share a role, and **alarm is always the darker of the two** —
otherwise a red brand drowns out real warnings.

**Never colour alone.** Every status carries colour **+ icon shape + text label**, because
red-green colour blindness would otherwise invert the meaning of "safe" and "blocked".

Dark text on amber and gold only, never white. White on Bucket Red only at 16 px bold or larger.
