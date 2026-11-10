'use client';

import { useState, type ReactNode } from 'react';
import { Button, ConfirmDialog, FormField, Modal } from '@jogylink/ui';

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-sand bg-white p-5 shadow-level-1">
      <h2 className="text-h2 font-semibold">{title}</h2>
      {note ? <p className="mt-1 text-caption text-stone">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Gallery() {
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function fakeSave() {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 1500));
    setSaving(false);
  }

  return (
    <div>
      <header className="bg-brand px-6 py-4">
        <h1 className="text-h1 font-bold tracking-tight text-white uppercase">JogyLink</h1>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <div>
          <p className="text-h1 font-bold">Component gallery</p>
          <p className="text-body text-stone">
            M1 shared components: C1 Button, C9 Form Field, C10 Modal. Visible in development only.
          </p>
        </div>

        <Section
          title="C1 — Button"
          note="Only one primary per screen. Secondary sits to its left. Danger always confirms."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary">Cancel</Button>
            <Button variant="primary">Save</Button>
            <Button variant="tertiary">Add to cart</Button>
            <Button variant="text">View all</Button>
            <Button variant="danger">Delete</Button>
            <Button disabled disabledReason="Add at least one product first">
              Place order
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button loading={saving} onClick={fakeSave}>
              {saving ? 'Saving…' : 'Click to save (1.5s)'}
            </Button>
            <Button size="web" variant="tertiary">
              Web size (48px)
            </Button>
          </div>
        </Section>

        <Section
          title="C9 — Form Field"
          note="Label above, asterisk and the word required, errors say how to fix it."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Product name" required placeholder="e.g. Kalu Dodol 250g" />
            <FormField
              label="Wholesale price (Rs)"
              helperText="The retail price is worked out automatically."
              inputMode="decimal"
            />
            <FormField
              label="Phone"
              defaultValue="0771234567"
              success
              helperText="Used for SMS receipts"
            />
            <FormField
              label="Markup"
              defaultValue="0.9"
              error="Enter a markup of 1.00 or more, so the website is never cheaper than the shop"
            />
            <FormField label="SKU (locked)" defaultValue="KD-250" disabled />
          </div>
        </Section>

        <Section title="C10 — Modal Dialog" note="Cancel on the left, the action on the right.">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Open a form dialog
            </Button>
            <Button variant="secondary" onClick={() => setSaveOpen(true)}>
              Open a confirmation
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete Kalu Dodol 250g
            </Button>
            {deleted ? <span className="text-caption text-safe">Deleted (demo only).</span> : null}
          </div>

          <Modal
            open={modalOpen}
            onOpenChange={setModalOpen}
            title="Add product"
            description="Enter the wholesale price. The retail price is derived."
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setModalOpen(false)}>Save product</Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <FormField label="Name" required />
              <FormField label="Wholesale price (Rs)" required inputMode="decimal" />
            </div>
          </Modal>

          <ConfirmDialog
            open={saveOpen}
            onOpenChange={setSaveOpen}
            confirmLabel="Save changes"
            message="Website prices will update straight away."
            onConfirm={() => new Promise((r) => setTimeout(r, 800))}
          />

          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            destructive
            itemName="Kalu Dodol 250g"
            confirmLabel="Delete"
            onConfirm={async () => {
              await new Promise((r) => setTimeout(r, 800));
              setDeleted(true);
            }}
          />
        </Section>
      </main>
    </div>
  );
}
