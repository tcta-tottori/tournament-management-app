export default function LoadingSpinner({ message = '読み込み中...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin"
           style={{ borderColor: '#fbbf24', borderTopColor: 'transparent' }} />
      <span className="text-sm text-gray-400">{message}</span>
    </div>
  );
}
