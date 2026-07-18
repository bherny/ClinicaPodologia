import { cloneElement, forwardRef, Fragment, isValidElement, useId } from "react";
import type { InputHTMLAttributes, ReactElement, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type FieldProps = {
  label: string;
  error?: string;
  children: React.ReactNode;
};

export function Field({ label, error, children }: FieldProps) {
  const generatedId = useId();
  const canLabelChild = isValidElement(children) && children.type !== Fragment;
  const controlId = canLabelChild ? (children.props as { id?: string }).id ?? generatedId : undefined;
  const child = canLabelChild
    ? cloneElement(children as ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>, {
        id: controlId,
        "aria-describedby": error ? `${generatedId}-error` : undefined,
        "aria-invalid": error ? true : undefined
      })
    : children;

  return (
    <div className="field">
      <label htmlFor={controlId}>{label}</label>
      {child}
      {error ? <span id={`${generatedId}-error`} className="field-error">{error}</span> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return <input ref={ref} className="input" {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(props, ref) {
  return <select ref={ref} className="select" {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(props, ref) {
  return <textarea ref={ref} className="textarea" {...props} />;
});
