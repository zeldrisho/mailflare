type CalendarInvitationInput = {
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  uid: string;
  method?: "REQUEST" | "CANCEL";
};

function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function isValidCalendarAttendee(value: string): boolean {
  if (value.length > 254 || /[\s<>]/.test(value)) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@") || at === value.length - 1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const labels = domain.split(".");
  return (
    local.length <= 64 &&
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    )
  );
}

export function calendarInvitationBytes(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function formatCalendarDate(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function createCalendarInvitation(input: CalendarInvitationInput): Uint8Array {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mailflare//Calendar//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method ?? "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}@mailflare`,
    `DTSTAMP:${formatCalendarDate(new Date())}`,
    `DTSTART:${formatCalendarDate(input.startsAt)}`,
    `DTEND:${formatCalendarDate(input.endsAt)}`,
    `SUMMARY:${escapeCalendarText(input.title)}`,
    `DESCRIPTION:${escapeCalendarText(input.description)}`,
    `LOCATION:${escapeCalendarText(input.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new TextEncoder().encode(lines.join("\r\n"));
}
