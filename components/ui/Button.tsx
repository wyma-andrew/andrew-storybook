import Link from "next/link";
import type { ComponentProps } from "react";
import { Button as GeckoButton, LoadingButton as GeckoLoadingButton } from "@geckoui/geckoui";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const geckoVariant: Record<Variant, "filled" | "outlined" | "ghost"> = {
  primary: "filled",
  secondary: "outlined",
  ghost: "ghost",
  danger: "outlined",
};

const extraClass: Record<Variant, string> = {
  primary: "",
  secondary: "",
  ghost: "",
  danger: "!border-danger-border !text-danger hover:!bg-[#1e1010]",
};

type ButtonOwnProps = Omit<React.ComponentProps<typeof GeckoButton>, "variant" | "color"> & { variant?: Variant };

export function Button({ variant = "secondary", className = "", ...props }: ButtonOwnProps) {
  return (
    <GeckoButton
      variant={geckoVariant[variant]}
      color="primary"
      className={`${extraClass[variant]} ${className}`}
      {...props}
    />
  );
}

type LoadingButtonOwnProps = Omit<React.ComponentProps<typeof GeckoLoadingButton>, "variant" | "color"> & {
  variant?: Variant;
};

export function LoadingButton({ variant = "secondary", className = "", ...props }: LoadingButtonOwnProps) {
  return (
    <GeckoLoadingButton
      variant={geckoVariant[variant]}
      color="primary"
      className={`${extraClass[variant]} ${className}`}
      {...props}
    />
  );
}

// Next <Link> styled to match GeckoUI's Button — same class + data
// attributes GeckoUI's CSS targets, so the two stay visually identical.
export function LinkButton({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return (
    <Link
      className={`GeckoUIButton ${extraClass[variant]} ${className}`}
      data-variant={geckoVariant[variant]}
      data-color="primary"
      data-size="md"
      {...props}
    />
  );
}

// Small in-card actions (Copy prompt, Edit, Regenerate…): smaller than Button.
export function MiniButton({
  ghost = false,
  className = "",
  ...props
}: React.ComponentProps<typeof GeckoButton> & { ghost?: boolean }) {
  return (
    <GeckoButton
      variant={ghost ? "ghost" : "outlined"}
      color="primary"
      size="sm"
      className={`text-xs ${className}`}
      {...props}
    />
  );
}

export function MiniLoadingButton({
  ghost = false,
  className = "",
  ...props
}: React.ComponentProps<typeof GeckoLoadingButton> & { ghost?: boolean }) {
  return (
    <GeckoLoadingButton
      variant={ghost ? "ghost" : "outlined"}
      color="primary"
      size="sm"
      className={`text-xs ${className}`}
      {...props}
    />
  );
}
