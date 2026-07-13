export function VeniceLogo({ height = 22 }: { height?: number }) {
  return (
    <img
      src="/venice-by-blite.svg"
      alt="Venice by blite"
      className="venice-logo"
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
