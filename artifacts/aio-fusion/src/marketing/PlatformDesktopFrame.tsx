type PlatformDesktopFrameProps = {
  src: string;
  alt: string;
  title: string;
  perspective?: "hero" | "subtle";
  fit?: "fill" | "cover";
  priority?: boolean;
};

export function PlatformDesktopFrame({
  src,
  alt,
  title,
  perspective = "hero",
  fit = "cover",
  priority = false,
}: PlatformDesktopFrameProps) {
  const frameSrc = `${import.meta.env.BASE_URL}images/platform-imac-frame.png`;

  return (
    <figure className="w-full">
      <div
        className="relative aspect-[1280/1030] w-full"
        style={{
          transform: perspective === "hero"
            ? "perspective(1100px) rotateY(-12deg) rotateX(1.5deg) rotateZ(1.2deg)"
            : "perspective(1100px) rotateY(-8deg) rotateX(1deg) rotateZ(-0.3deg)",
          transformOrigin: "50% 52%",
          filter: "drop-shadow(18px 27px 19px rgba(16, 43, 54, 0.26))",
        }}
      >
        <div
          className="absolute overflow-hidden bg-[#1E647C]"
          style={{ left: "4.3%", top: "5.5%", width: "90.7%", height: "63.2%" }}
        >
          <div className="flex h-[8%] min-h-3 items-center gap-[0.7%] border-b border-[#CBD1D5] bg-[#E9EDF0] px-[2%]" aria-hidden="true">
            <span className="aspect-square h-[24%] rounded-full bg-[#EF6A66]" />
            <span className="aspect-square h-[24%] rounded-full bg-[#F0BD58]" />
            <span className="aspect-square h-[24%] rounded-full bg-[#6CC58A]" />
            <span className="ml-[3%] flex h-[70%] w-[58%] items-center rounded-t-[5px] bg-white px-[2%] text-[clamp(4px,0.65vw,9px)] font-medium text-[#3F5660]">
              AIO Fusion
            </span>
            <span className="ml-auto flex h-[64%] w-[18%] items-center justify-center rounded-[4px] bg-white/80 text-[clamp(3px,0.5vw,8px)] text-[#7C8991]">
              aiofusion.ai
            </span>
          </div>
          <img
            src={src}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            className={`block h-[92%] w-full object-top ${fit === "fill" ? "object-fill" : "object-cover"}`}
          />
        </div>
        <img
          src={frameSrc}
          alt=""
          aria-hidden="true"
          loading={priority ? "eager" : "lazy"}
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ clipPath: "inset(0 0 14% 0)" }}
        />
        <img
          src={frameSrc}
          alt=""
          aria-hidden="true"
          loading={priority ? "eager" : "lazy"}
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{
            clipPath: "inset(85.5% 0 0 0)",
            transform: perspective === "hero" ? "rotateZ(-3.2deg)" : "rotateZ(-1.3deg)",
            transformOrigin: "50% 85%",
          }}
        />
      </div>
      <figcaption className="sr-only">{title}</figcaption>
    </figure>
  );
}