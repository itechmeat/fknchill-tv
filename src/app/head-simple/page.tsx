import dynamic from "next/dynamic";

const HeadRotationSimple = dynamic(
  () => import("@/features/tv/HeadRotation/HeadRotationSimple"),
  { ssr: false }
);

export default function Home() {
  return (
    <div>
      <HeadRotationSimple />
    </div>
  );
}
