import DeviceLog from "../components/DeviceLog.jsx";
import MediaGallery from "../components/MediaGallery.jsx";

export default function Library() {
  return (
    <div className="library-page">
      <MediaGallery />
      <DeviceLog />
    </div>
  );
}
