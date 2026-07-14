export function VeniceLogo({ height = 22 }: { height?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}venice-by-blite.svg`}
      alt="Venice by blite"
      className="venice-logo"
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
