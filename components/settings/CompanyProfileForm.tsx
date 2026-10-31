"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTenantProfileAction } from "@/app/actions/tenant-actions";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";

export interface CompanyProfileFormProps {
  initialName: string;
  initialCurrency: string;
  initialLocale: "pt-BR" | "es-419";
  initialPhone: string | null;
  initialAddress: string | null;
  initialPixKey: string | null;
  initialPixKeyType: string | null;
  initialPixName: string | null;
  initialPixCity: string | null;
  initialBobQrImage: string | null;
  readOnly: boolean;
}

export function CompanyProfileForm({
  initialName,
  initialCurrency,
  initialLocale,
  initialPhone,
  initialAddress,
  initialPixKey,
  initialPixKeyType,
  initialPixName,
  initialPixCity,
  initialBobQrImage,
  readOnly,
}: CompanyProfileFormProps) {
  const router = useRouter();
  const t = getUiDictionary(initialLocale);
  const [name, setName] = useState(initialName);
  const [currency, setCurrency] = useState(initialCurrency);
  const [locale, setLocale] = useState(initialLocale);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [address, setAddress] = useState(initialAddress ?? "");
  const [pixKey, setPixKey] = useState(initialPixKey ?? "");
  const [pixKeyType, setPixKeyType] = useState(initialPixKeyType ?? "cpf");
  const [pixName, setPixName] = useState(initialPixName ?? "");
  const [pixCity, setPixCity] = useState(initialPixCity ?? "");
  const [bobQrImage, setBobQrImage] = useState(initialBobQrImage ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const currencyOptions = [
    { value: "BRL", label: t.companyForm.currencyBRL },
    { value: "BOB", label: t.companyForm.currencyBOB },
  ];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;

    setSaving(true);
    setMessage(null);
    setFieldErrors({});

    const result = await updateTenantProfileAction({
      name,
      currency,
      locale,
      phone: phone.trim() === "" ? null : phone.trim(),
      address: address.trim() === "" ? null : address.trim(),
      pixKey: pixKey.trim() === "" ? null : pixKey.trim(),
      pixKeyType: pixKeyType || null,
      pixName: pixName.trim() === "" ? null : pixName.trim(),
      pixCity: pixCity.trim() === "" ? null : pixCity.trim(),
      bobQrImage: bobQrImage.trim() === "" ? null : bobQrImage.trim(),
    });

    setSaving(false);

    if (!result.ok) {
      setMessage({ ok: false, text: result.error });
      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
      return;
    }

    setMessage({ ok: true, text: t.companyForm.success });
    router.refresh();
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-800 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-400 md:text-sm";

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="company-name"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t.companyForm.nameLabel}
          </label>
          <input
            id="company-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly || saving}
            className={`mt-1 ${inputClass}`}
            maxLength={120}
            required
          />
          {fieldErrors.name && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.name[0]}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="company-currency"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t.companyForm.currencyLabel}
          </label>
          <select
            id="company-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={readOnly || saving}
            className={`mt-1 ${inputClass}`}
          >
            {currencyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldErrors.currency && (
            <p className="mt-1 text-xs text-red-600">
              {fieldErrors.currency[0]}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="company-locale"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t.companyForm.localeLabel}
          </label>
          <select
            id="company-locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value as "pt-BR" | "es-419")}
            disabled={readOnly || saving}
            className={`mt-1 ${inputClass}`}
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABELS[code]}
              </option>
            ))}
          </select>
          {fieldErrors.locale && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.locale[0]}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="company-phone"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t.companyForm.phoneLabel}
          </label>
          <input
            id="company-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={readOnly || saving}
            placeholder="+5511999999999"
            className={`mt-1 ${inputClass}`}
          />
          {fieldErrors.phone && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.phone[0]}</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="company-address"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t.companyForm.addressLabel}
          </label>
          <input
            id="company-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={readOnly || saving}
            className={`mt-1 ${inputClass}`}
            maxLength={200}
          />
          {fieldErrors.address && (
            <p className="mt-1 text-xs text-red-600">
              {fieldErrors.address[0]}
            </p>
          )}
        </div>

        <div className="sm:col-span-2 border-t border-slate-200 pt-4 mt-2">
          <h3 className="text-sm font-semibold text-slate-800">{t.companyForm.pixTitle}</h3>
          <p className="text-xs text-slate-500 mb-3">{t.companyForm.pixHint}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pix-key" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.companyForm.pixKeyLabel}
              </label>
              <input
                id="pix-key"
                type="text"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                disabled={readOnly || saving}
                placeholder={t.companyForm.pixKeyPlaceholder}
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label htmlFor="pix-key-type" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.companyForm.pixKeyTypeLabel}
              </label>
              <select
                id="pix-key-type"
                value={pixKeyType}
                onChange={(e) => setPixKeyType(e.target.value)}
                disabled={readOnly || saving}
                className={`mt-1 ${inputClass}`}
              >
                <option value="cpf">{t.companyForm.pixTypeCpf}</option>
                <option value="cnpj">{t.companyForm.pixTypeCnpj}</option>
                <option value="email">{t.companyForm.pixTypeEmail}</option>
                <option value="phone">{t.companyForm.pixTypePhone}</option>
                <option value="random">{t.companyForm.pixTypeRandom}</option>
              </select>
            </div>
            <div>
              <label htmlFor="pix-name" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.companyForm.pixNameLabel}
              </label>
              <input
                id="pix-name"
                type="text"
                value={pixName}
                onChange={(e) => setPixName(e.target.value)}
                disabled={readOnly || saving}
                maxLength={25}
                placeholder={t.companyForm.pixNamePlaceholder}
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label htmlFor="pix-city" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.companyForm.pixCityLabel}
              </label>
              <input
                id="pix-city"
                type="text"
                value={pixCity}
                onChange={(e) => setPixCity(e.target.value)}
                disabled={readOnly || saving}
                maxLength={15}
                placeholder={t.companyForm.pixCityPlaceholder}
                className={`mt-1 ${inputClass}`}
              />
            </div>
          </div>
        </div>

        <div className="sm:col-span-2 border-t border-slate-200 pt-4 mt-2">
          <h3 className="text-sm font-semibold text-slate-800">{t.companyForm.bobTitle}</h3>
          <p className="text-xs text-slate-500 mb-3">{t.companyForm.bobHint}</p>
          <div className="space-y-3">
            <div>
              <label htmlFor="bob-qr" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.companyForm.bobImageLabel}
              </label>
              <textarea
                id="bob-qr"
                value={bobQrImage}
                onChange={(e) => setBobQrImage(e.target.value)}
                disabled={readOnly || saving}
                rows={2}
                spellCheck={false}
                placeholder={t.companyForm.bobImagePlaceholder}
                className={`mt-1 ${inputClass} break-all font-mono text-[11px]`}
              />
              {fieldErrors.bobQrImage && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.bobQrImage[0]}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Carregar imagem do QR Code (Bolívia)
              </label>
              <input
                type="file"
                accept="image/*"
                disabled={readOnly || saving}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (uploadEvent) => {
                    const result = uploadEvent.target?.result;
                    if (typeof result === "string") {
                      setBobQrImage(result);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
                className="mt-1 block w-full text-xs text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-700"
              />
            </div>
            {bobQrImage && (
              <div className="mt-2">
                <p className="text-xs font-medium text-slate-600 mb-1">Pré-visualização do QR Simple:</p>
                <img src={bobQrImage} alt="QR Simple Preview" className="h-32 w-32 object-contain rounded-lg border border-slate-200 bg-white p-1" />
              </div>
            )}
          </div>
        </div>
      </div>

      {message && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            message.ok
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      {!readOnly && (
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? t.companyForm.saving : t.companyForm.save}
        </button>
      )}

      {readOnly && (
        <p className="text-xs text-slate-400">{t.companyForm.readOnlyNote}</p>
      )}
    </form>
  );
}
