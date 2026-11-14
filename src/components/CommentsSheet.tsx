import React, { useState } from 'react';
import { X, Heart, Send, MessageCircle } from 'lucide-react';
import { Comment, RoomListing } from '../types';

interface CommentsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomListing;
  comments: Comment[];
  onAddComment: (roomId: string, text: string) => void;
  onToggleLikeComment: (commentId: string) => void;
}

export const CommentsSheet: React.FC<CommentsSheetProps> = ({
  isOpen,
  onClose,
  room,
  comments,
  onAddComment,
  onToggleLikeComment,
}) => {
  const [commentText, setCommentText] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onAddComment(room.id, commentText.trim());
    setCommentText('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full sm:max-w-md h-[75vh] sm:h-[80vh] bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-pink-400" />
            <h3 className="font-bold text-sm text-white">
              Comments ({comments.length})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center hover:bg-zinc-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {comments.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              No comments yet. Ask a question about this room!
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex items-start gap-3 text-xs">
                <img
                  src={c.author.avatar}
                  alt={c.author.name}
                  className="w-8 h-8 rounded-full object-cover border border-zinc-800 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-bold text-zinc-200">{c.author.name}</span>
                    {c.author.isLandlord && (
                      <span className="text-[9px] bg-pink-500/20 text-pink-300 border border-pink-500/30 px-1 py-0.2 rounded font-bold">
                        Host
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500">{c.timestamp}</span>
                  </div>
                  <p className="text-zinc-300 leading-relaxed">{c.text}</p>
                </div>
                <button
                  onClick={() => onToggleLikeComment(c.id)}
                  className="flex flex-col items-center gap-0.5 text-zinc-400 hover:text-rose-500 transition-colors"
                >
                  <Heart className={`w-3.5 h-3.5 ${c.isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                  <span className="text-[10px]">{c.likes + (c.isLiked ? 1 : 0)}</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-3 bg-zinc-900 border-t border-zinc-800 flex items-center gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment or ask host..."
            className="flex-1 px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-pink-500"
          />
          <button
            type="submit"
            disabled={!commentText.trim()}
            className="p-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white rounded-xl shadow-md transition-all active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
