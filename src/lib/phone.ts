/**
 * Phone Number Validation & Normalization
 *
 * All phone numbers MUST be stored in E.164 format: +[country][number]
 * Examples: +442071234567, +14155552671, +918527654321
 *
 * Why E.164?
 * - Unambiguous globally (includes country code)
 * - Required by Twilio API
 * - Enables consistent deduplication
 * - Works across all carriers and countries
 */

// Using libphonenumber-js for parsing (lighter than Google's libphonenumber)
// npm install libphonenumber-js
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Strict E.164 regex for already-normalized numbers */
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Normalize a phone number to E.164 format.
 *
 * Handles various input formats:
 * - "07700 900000" → "+447700900000" (with defaultCountry GB)
 * - "+1 (415) 555-2671" → "+14155552671"
 * - "00442071234567" → "+442071234567"
 *
 * @param phone - Raw phone input from user
 * @param defaultCountry - ISO 3166-1 alpha-2 country code (default: "GB")
 * @returns E.164 formatted number or null if invalid
 */
export function normalizePhone(
  phone: string,
  defaultCountry: CountryCode = "GB"
): string | null {
  if (!phone) return null;

  // Strip common formatting characters
  const cleaned = phone.replace(/[\s\-().]/g, "");

  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;

  return parsed.format("E.164");
}

/**
 * Validate that a string is a valid E.164 phone number.
 * Use this for already-normalized numbers (e.g., from your database).
 */
export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone);
}

/**
 * Get display-friendly phone format for the user.
 * "+447700900000" → "+44 7700 900000"
 */
export function formatPhoneForDisplay(phone: string): string {
  const parsed = parsePhoneNumberFromString(phone);
  return parsed?.formatInternational() || phone;
}

/**
 * Get country code from an E.164 number.
 * "+447700900000" → "GB"
 */
export function getCountryFromPhone(phone: string): CountryCode | undefined {
  const parsed = parsePhoneNumberFromString(phone);
  return parsed?.country;
}

/**
 * Mask a phone number for display in UI/logs.
 *
 * "+447700900000" → "+44 **** 0000"
 *
 * Use this when showing the phone number in:
 * - "Code sent to +44 **** 0000"
 * - Audit logs
 * - Error messages returned to client
 */
export function maskPhone(phone: string): string {
  if (phone.length < 8) return "****";
  return phone.slice(0, 4) + " **** " + phone.slice(-4);
}
