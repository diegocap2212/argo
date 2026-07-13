/**
 * Normalização canônica de release — fonte ÚNICA usada tanto no sync (field-mapper)
 * quanto nos consumidores históricos do dataset. Antes essas regras viviam
 * duplicadas e divergiam (ex.: ASSINECAR→O4R2 só existia no runtime).
 *
 * Recebe um valor cru de release e devolve o id normalizado.
 */
export function normalizeReleaseId(raw: unknown): string {
  const r = String(raw ?? '').toUpperCase().trim();
  if (!r) return 'OUTROS';

  // Onda 4 — Release 2 (e variantes/aliases conhecidos)
  if (r.includes('ONDA 4') && r.includes('RELEASE 2')) return 'O4R2';
  if (r.includes('WAVE 4') && r.includes('RELEASE 2')) return 'O4R2';
  if (r.includes('W4') && r.includes('R2')) return 'O4R2';
  if (r === '2024.1') return 'O4R2';
  if (r.includes('ASSINECAR')) return 'O4R2';

  // Onda 4 — Release 1
  if (r.includes('ONDA 4') && r.includes('RELEASE 1')) return 'O4R1';
  if (r.includes('WAVE 4') && r.includes('RELEASE 1')) return 'O4R1';
  if (r.includes('W4') && r.includes('R1')) return 'O4R1';

  // Padrão O4Rn → remove separadores (O4R 1 → O4R1)
  if (r.startsWith('O4R')) return r.replace(/[^A-Z0-9]/g, '');

  return r;
}
