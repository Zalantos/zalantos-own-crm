"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { MenuIcon, XIcon } from "lucide-react";
import { LandingButton } from "@/components/landing/landing-button";

type LandingMobileMenuProps = {
  items: Array<{
    href: string;
    label: string;
  }>;
};

export function LandingMobileMenu({ items }: LandingMobileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="inline-flex size-10 items-center justify-center rounded-full border border-black/10 bg-white text-[#171717] transition-colors hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-[#2d6cdf]/35 focus-visible:outline-none md:hidden">
        <MenuIcon className="size-4" aria-hidden="true" />
        <span className="sr-only">Abrir menú</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20" />
        <Dialog.Popup className="fixed inset-x-3 top-3 z-50 rounded-2xl border border-black/10 bg-[#fbfbf8] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.14)] outline-none md:hidden">
          <div className="flex items-center justify-between">
            <Dialog.Title className="font-display text-xl font-semibold">
              Zalantos
            </Dialog.Title>
            <Dialog.Close className="inline-flex size-10 items-center justify-center rounded-full border border-black/10 bg-white text-[#171717] transition-colors hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-[#2d6cdf]/35 focus-visible:outline-none">
              <XIcon className="size-4" aria-hidden="true" />
              <span className="sr-only">Cerrar menú</span>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Navegación principal de CRM Zalantos
          </Dialog.Description>

          <div className="mt-8 grid gap-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-2 py-3 text-lg text-[#292925] transition-colors hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-[#2d6cdf]/35 focus-visible:outline-none"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="mt-8 grid gap-3">
            <LandingButton
              href="#demo"
              size="large"
              className="w-full"
              variant="primary"
              onClick={() => setOpen(false)}
            >
              Solicitar demo
            </LandingButton>
            <LandingButton
              href="/login"
              size="large"
              className="w-full"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Entrar al CRM
            </LandingButton>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
