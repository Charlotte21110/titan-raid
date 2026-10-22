import type { BannerState } from '../hooks/useRoom';

export function MechanicBanner({ banner, debug }: { banner: BannerState | null; debug: boolean }) {
  if (!banner) return null;
  return (
    <div className="banner">
      <div className="banner-title">{banner.title}</div>
      <div className="banner-call">{banner.call}</div>
      {debug ? <div className="banner-src">raid_events · postgres_changes</div> : null}
    </div>
  );
}
