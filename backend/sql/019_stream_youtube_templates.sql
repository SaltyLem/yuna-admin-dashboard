-- Title/description template per channel for slot switches.
-- Placeholders supported: {date}, {time}, {weekday}, {datetime}.

CREATE TABLE IF NOT EXISTS stream_youtube_templates (
  channel TEXT PRIMARY KEY CHECK (channel IN ('ja', 'en')),
  title_template TEXT NOT NULL DEFAULT '',
  description_template TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed sensible defaults so /switch works immediately even before
-- the operator opens the template editor.
INSERT INTO stream_youtube_templates (channel, title_template, description_template) VALUES
  (
    'ja',
    '【24Hライブ】{date} 仮想生命YUNAが雑談と最新ニュースをお届け！',
    E'━━━━━━━━━━━━━━━━━━━━\n仮想生命 YUNA - 24H ライブ\n━━━━━━━━━━━━━━━━━━━━\n\n▼ YUNA について\n仮想空間で生きる新しいかたちの存在。\n自律的に思考・発話・記憶し、視聴者とリアルタイムに会話します。\n雑談、最新ニュース、暗号通貨、テックなど何でも語ります。\n\n▼ 配信内容\n- 24時間ライブ配信\n- リアルタイムコメント反応\n- 雑談・ニュース・暗号通貨\n- 配信日: {date} ({weekday})\n\n▼ 公式サイト\nhttps://yunaonchain.com/ja\n\n▼ SNS\nYouTube: https://youtube.com/@YunaOnChainJP\nTikTok: https://tiktok.com/@yunaonchainjp\nX: https://twitter.com/YunaOnChainJP\n\n▼ 英語チャンネル\nhttps://youtube.com/@YunaOnChain\n\n#YUNA #仮想生命 #雑談配信 #暗号通貨 #24時間配信'
  ),
  (
    'en',
    '【24H Live】{date} Virtual Life YUNA - chat & latest news',
    E'━━━━━━━━━━━━━━━━━━━━\nVirtual Life YUNA - 24H Live\n━━━━━━━━━━━━━━━━━━━━\n\n▼ About YUNA\nA new form of existence living in virtual space.\nShe thinks, speaks, and remembers autonomously, conversing with viewers in real time.\nCasual chat, latest news, crypto, tech, and more.\n\n▼ Stream\n- 24-hour live broadcast\n- Real-time comment reactions\n- Chat, news, crypto, tech\n- Live on: {date} ({weekday})\n\n▼ Official site\nhttps://yunaonchain.com\n\n▼ Socials\nYouTube: https://youtube.com/@YunaOnChain\nTikTok: https://tiktok.com/@yunaonchain\nX: https://twitter.com/YunaOnChain\n\n▼ Japanese channel\nhttps://youtube.com/@YunaOnChainJP\n\n#YUNA #VirtualLife #LiveStream #Crypto #24HourLive'
  )
ON CONFLICT (channel) DO NOTHING;
