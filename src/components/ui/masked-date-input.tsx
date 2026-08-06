"use client";

import { CalendarDays } from "lucide-react";
import {
  type ChangeEvent,
  type InputHTMLAttributes,
  useId,
  useRef,
  useState,
} from "react";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue"
> & {
  value?: string;
  defaultValue?: string;
};

function isoToBr(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function maskDate(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function brToIso(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return "";

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day, 12, 0, 0);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return "";
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function initialDisplayValue(value: string): string {
  return value.includes("-") ? isoToBr(value) : maskDate(value);
}

export function MaskedDateInput({
  value,
  defaultValue = "",
  onChange,
  min,
  max,
  name,
  id,
  required,
  disabled,
  readOnly,
  className,
  ...inputProps
}: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const textRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);

  const [displayValue, setDisplayValue] = useState(() =>
    initialDisplayValue(typeof value === "string" ? value : defaultValue),
  );

  function emitValue(isoValue: string) {
    if (!onChange) return;

    const event = {
      target: {
        value: isoValue,
        name: name ?? "",
      },
      currentTarget: {
        value: isoValue,
        name: name ?? "",
      },
    } as ChangeEvent<HTMLInputElement>;

    onChange(event);
  }

  function validationMessage(maskedValue: string): string {
    if (!maskedValue) return "";

    if (maskedValue.length < 10) {
      return "Complete a data no formato DD/MM/AAAA.";
    }

    const isoValue = brToIso(maskedValue);

    if (!isoValue) {
      return "Informe uma data válida.";
    }

    const minimum = min ? String(min) : "";
    const maximum = max ? String(max) : "";

    if (minimum && isoValue < minimum) {
      return `A data deve ser igual ou posterior a ${isoToBr(minimum)}.`;
    }

    if (maximum && isoValue > maximum) {
      return `A data deve ser igual ou anterior a ${isoToBr(maximum)}.`;
    }

    return "";
  }

  function updateText(rawValue: string) {
    const maskedValue = maskDate(rawValue);
    setDisplayValue(maskedValue);

    const message = validationMessage(maskedValue);
    textRef.current?.setCustomValidity(message);

    if (!maskedValue) {
      emitValue("");
      return;
    }

    const isoValue = brToIso(maskedValue);

    if (isoValue && !message) {
      emitValue(isoValue);
    }
  }

  function chooseDate(isoValue: string) {
    setDisplayValue(isoToBr(isoValue));
    textRef.current?.setCustomValidity("");
    emitValue(isoValue);
  }

  function openCalendar() {
    if (disabled || readOnly) return;

    const nativeInput = nativeRef.current as
      | (HTMLInputElement & { showPicker?: () => void })
      | null;

    if (!nativeInput) return;

    if (nativeInput.showPicker) {
      nativeInput.showPicker();
    } else {
      nativeInput.click();
    }
  }

  const isoValue = brToIso(displayValue);

  return (
    <div className={`masked-date-control${className ? ` ${className}` : ""}`}>
      <input
        {...inputProps}
        aria-label={inputProps["aria-label"] ?? "Data"}
        autoComplete={inputProps.autoComplete ?? "off"}
        disabled={disabled}
        id={inputId}
        inputMode="numeric"
        maxLength={10}
        onBlur={() => {
          textRef.current?.setCustomValidity(
            validationMessage(displayValue),
          );
        }}
        onChange={(event) => updateText(event.target.value)}
        placeholder="dd/mm/aaaa"
        readOnly={readOnly}
        ref={textRef}
        required={required}
        title="Digite a data no formato DD/MM/AAAA"
        type="text"
        value={displayValue}
      />

      <button
        aria-label="Abrir calendário"
        disabled={disabled || readOnly}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openCalendar();
        }}
        title="Escolher no calendário"
        type="button"
      >
        <CalendarDays aria-hidden="true" size={17} />
      </button>

      <input
        aria-hidden="true"
        className="masked-date-native"
        disabled={disabled || readOnly}
        max={max}
        min={min}
        onChange={(event) => chooseDate(event.target.value)}
        ref={nativeRef}
        tabIndex={-1}
        type="date"
        value={isoValue}
      />

      {name ? <input name={name} type="hidden" value={isoValue} /> : null}
    </div>
  );
}
