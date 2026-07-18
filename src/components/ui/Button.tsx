import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger" | "ghost" | "whatsapp";
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return <button className={clsx("button", variant !== "default" && `button--${variant}`, className)} {...props} />;
}
