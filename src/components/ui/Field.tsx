import { cloneElement, forwardRef, Fragment, isValidElement, useId, useRef } from "react";
import type {
  ForwardedRef,
  InputHTMLAttributes,
  ReactElement,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";
import { mergeVoiceValue, type VoiceInputMode } from "../../lib/voice";
import { VoiceInputButton } from "./VoiceInputButton";

type FieldProps = {
  label: string;
  error?: string;
  children: React.ReactNode;
};

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  voiceMode?: VoiceInputMode;
};

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  voiceMode?: VoiceInputMode;
};

const UNSUPPORTED_VOICE_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "email",
  "file",
  "hidden",
  "month",
  "password",
  "radio",
  "range",
  "reset",
  "submit",
  "time",
  "week"
]);

const DIGIT_FIELD_PATTERN = /(dni|ruc|documento|telefono|tel[eé]fono|celular|whatsapp|numero[_-]?operacion)/i;

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function updateNativeValue(control: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = control instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

function resolveInputVoiceMode(props: InputProps): VoiceInputMode {
  if (props.voiceMode) return props.voiceMode;
  if (props.disabled || props.readOnly) return "off";

  const type = props.type?.toLocaleLowerCase("es-PE") ?? "text";
  if (UNSUPPORTED_VOICE_TYPES.has(type)) return "off";
  if (type === "number" || props.inputMode === "decimal") return "number";
  if (type === "tel" || props.inputMode === "numeric" || DIGIT_FIELD_PATTERN.test(props.name ?? "")) return "digits";
  return "text";
}

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

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ voiceMode, ...props }, forwardedRef) {
  const internalRef = useRef<HTMLInputElement | null>(null);
  const mode = resolveInputVoiceMode({ ...props, voiceMode });
  const setRef = (node: HTMLInputElement | null) => {
    internalRef.current = node;
    assignRef(forwardedRef, node);
  };

  const input = <input ref={setRef} className="input" {...props} />;
  if (mode === "off") return input;

  return (
    <div className="voice-control voice-control--input">
      {input}
      <VoiceInputButton
        compact
        mode={mode}
        disabled={props.disabled}
        onTranscript={(transcript) => {
          const control = internalRef.current;
          if (!control) return;
          const nextValue = mergeVoiceValue(control.value, transcript, mode);
          if (nextValue !== control.value) updateNativeValue(control, nextValue);
          control.focus();
        }}
      />
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(props, ref) {
  return <select ref={ref} className="select" {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ voiceMode = "text", ...props }, forwardedRef) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const mode = props.disabled || props.readOnly ? "off" : voiceMode;
  const setRef = (node: HTMLTextAreaElement | null) => {
    internalRef.current = node;
    assignRef(forwardedRef, node);
  };

  const textarea = <textarea ref={setRef} className="textarea" {...props} />;
  if (mode === "off") return textarea;

  return (
    <div className="voice-control voice-control--textarea">
      {textarea}
      <VoiceInputButton
        compact
        mode={mode}
        disabled={props.disabled}
        onTranscript={(transcript) => {
          const control = internalRef.current;
          if (!control) return;
          const nextValue = mergeVoiceValue(control.value, transcript, mode);
          if (nextValue !== control.value) updateNativeValue(control, nextValue);
          control.focus();
        }}
      />
    </div>
  );
});
