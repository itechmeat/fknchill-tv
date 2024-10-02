import dynamic from "next/dynamic";

const Breath = dynamic(() => import("@/features/tv/Breath/Breath"), {
  ssr: false,
});

export default function Home() {
  return (
    <div>
      <Breath />
    </div>
  );
}
