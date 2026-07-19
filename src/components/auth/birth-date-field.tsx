"use client";

import { CalendarDays } from "lucide-react";
import { useId, useRef, useState } from "react";

type Props = {
  label?: string;
  name?: string;
  required?: boolean;
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
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function BirthDateField({
  label = "Data de nascimento",
  name = "dataNascimento",
  required = true,
  defaultValue = "",
}: Props) {
  const id = useId();
  const nativeRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(
    defaultValue.includes("-") ? isoToBr(defaultValue) : defaultValue
  );

  function openCalendar() {
    const input = nativeRef.current;
    if (!input) return;

    const pickerInput = input as HTMLInputElement & {
      showPicker?: () => void;
    };

    if (pickerInput.showPicker) {
      pickerInput.showPicker();
    } else {
      input.click();
    }
  }

  return (
    <div className="v21-birth-field">
      <label htmlFor={id}>{label}</label>

      <div className="v21-date-control">
        <input
          autoComplete="bday"
          id={id}
          inputMode="numeric"
          maxLength={10}
          name={name}
          onChange={(event) => setValue(maskDate(event.target.value))}
          pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
          placeholder="DD/MM/AAAA"
          required={required}
          title="Digite a data no formato DD/MM/AAAA"
          type="text"
          value={value}
        />

        <button
          aria-label="Abrir calendário"
          onClick={openCalendar}
          title="Escolher no calendário"
          type="button"
        >
          <CalendarDays size={17} />
        </button>

        <input
          aria-hidden="true"
          className="v21-native-date"
          max={new Date().toISOString().slice(0, 10)}
          min="1930-01-01"
          onChange={(event) => setValue(isoToBr(event.target.value))}
          ref={nativeRef}
          tabIndex={-1}
          type="date"
          value={brToIso(value)}
        />
      </div>
    </div>
  );
}
