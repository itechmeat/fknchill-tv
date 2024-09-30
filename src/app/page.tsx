import dynamic from "next/dynamic";

const HeadRotation = dynamic(
  () => import("@/features/tv/HeadRotation/HeadRotation"),
  { ssr: false }
);

export default function Home() {
  return (
    <div>
      <HeadRotation />
    </div>
  );
}
