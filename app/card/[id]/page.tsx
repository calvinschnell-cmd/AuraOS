import { permanentRedirect } from "next/navigation";

/** Old card links (printed certificates, earlier QR codes) land on the result page. */
export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/r/${encodeURIComponent(id)}`);
}
