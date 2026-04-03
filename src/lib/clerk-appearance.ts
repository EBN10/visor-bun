import type { Appearance } from "@clerk/types";

export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorText: "var(--foreground)",
    colorTextSecondary: "var(--muted-foreground)",
    colorBackground: "var(--card)",
    colorInputBackground: "var(--background)",
    colorInputText: "var(--foreground)",
    colorDanger: "var(--destructive)",
    borderRadius: "var(--radius)",
    fontFamily:
      "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons:
      "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif",
  },
  elements: {
    rootBox: "mx-auto",
    card: "border border-border bg-card text-card-foreground shadow-lg",
    footerActionLink: "text-primary hover:text-primary/80",
    userButtonPopoverCard:
      "border border-border bg-card text-card-foreground shadow-lg",
    userButtonPopoverMain: "bg-card text-card-foreground",
    userPreviewMainIdentifier: "text-foreground dark:text-white",
    userPreviewMainIdentifierText: "text-foreground dark:text-white",
    userPreviewSecondaryIdentifier:
      "text-muted-foreground dark:text-white/80",
    userButtonPopoverActionButton:
      "text-foreground hover:text-foreground dark:text-white dark:hover:text-white",
    userButtonPopoverActionButtonIcon:
      "text-muted-foreground dark:text-white/80",
    userButtonPopoverFooter: "text-foreground dark:text-white",
    userButtonPopoverFooterPagesLink:
      "text-muted-foreground hover:text-foreground dark:text-white/80 dark:hover:text-white",
  },
};
