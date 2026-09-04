import { useEffect, useMemo, useState } from 'react'
import splatoonIcon from '../asset/bot icon/splatoon.png'
import {
  AtSign,
  Bell,
  BellRing,
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  ExternalLink,
  Eye,
  Filter,
  Headphones,
  Inbox,
  LoaderCircle,
  Lock,
  Menu,
  Plus,
  RefreshCw,
  Repeat2,
  Search,
  Settings,
  Smartphone,
  Trash2,
  X,
  Youtube,
} from 'lucide-react'
import {
  isValidYouTubeChannel,
  isRecentYouTubeItem,
  getYouTubeReadId,
  loadReadYouTubeItems,
  loadYouTubeApiKey,
  loadYouTubeChannels,
  saveReadYouTubeItems,
  saveYouTubeApiKey,
  saveYouTubeChannels,
  useYouTubeNotifications,
} from './youtube'
import {
  formatXTime,
  isRecentXItem,
  loadReadXItems,
  loadXUsers,
  normalizeXUser,
  saveReadXItems,
  saveXUsers,
  useXNotifications,
} from './x'
import {
  clearAsmrLock,
  formatAsmrTime,
  hashAsmrPassword,
  isRecentAsmrItem,
  loadAsmrLockHash,
  loadAsmrUnlocked,
  loadAsmrVoiceFilters,
  loadReadAsmrItems,
  lockAsmr,
  saveAsmrLockHash,
  saveAsmrUnlocked,
  saveAsmrVoiceFilters,
  saveReadAsmrItems,
  useAsmrNotifications,
} from './asmr'
import {
  formatSplatoonEnd,
  getSplatoonReadId,
  type SplatoonStageItem,
  useSplatoonStages,
} from './splatoon'

type NoticeCategory = 'すべて' | 'YouTube' | 'X' | 'ASMR' | 'Splatoon'

type Notice = {
  id: string
  source: string
  initials: string
  accent: string
  category: Exclude<NoticeCategory, 'すべて'>
  time: string
  title: string
  body: string
  unread: boolean
  scheduled?: string
  url?: string
  thumbnailUrl?: string | null
  avatarUrl?: string | null
  urlLabel?: string
  secondaryUrl?: string | null
  secondaryLabel?: string
  repostedBy?: { name: string; handle: string }
  asmrDetails?: {
    source: string
    voice: string[]
    maker: string | null
    scenario: string[]
    illust: string[]
    price: number | null
  }
  splatoonDetails?: {
    rotations: SplatoonStageItem[]
  }
}

const initialNotices: Notice[] = []

const navItems = [
  { id: 'home', label: 'ホーム', icon: Inbox },
  { id: 'settings', label: '設定', icon: Settings },
] as const

const filters: NoticeCategory[] = ['すべて', 'YouTube', 'X', 'ASMR', 'Splatoon']

function App() {
  const [notices, setNotices] = useState(initialNotices)
  const [filter, setFilter] = useState<NoticeCategory>('すべて')
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [inAppEnabled, setInAppEnabled] = useState(true)
  const [compactView, setCompactView] = useState(false)
  const [enabledCategories, setEnabledCategories] = useState<Array<Exclude<NoticeCategory, 'すべて'>>>(['YouTube', 'X', 'ASMR', 'Splatoon'])
  const [activePage, setActivePage] = useState<'home' | 'settings'>('home')
  const [xUsers, setXUsers] = useState(loadXUsers)
  const [xUserInput, setXUserInput] = useState('')
  const [readXItems, setReadXItems] = useState(() => new Set(loadReadXItems()))
  const [youtubeChannels, setYoutubeChannels] = useState(loadYouTubeChannels)
  const [youtubeApiKey, setYouTubeApiKey] = useState(loadYouTubeApiKey)
  const [youtubeChannelInput, setYoutubeChannelInput] = useState('')
  const [readYouTubeItems, setReadYouTubeItems] = useState(() => new Set(loadReadYouTubeItems()))
  const [readAsmrItems, setReadAsmrItems] = useState(() => new Set(loadReadAsmrItems()))
  const [asmrVoiceFilters, setAsmrVoiceFilters] = useState(loadAsmrVoiceFilters)
  const [asmrVoiceInput, setAsmrVoiceInput] = useState('')
  const [asmrLockHash, setAsmrLockHash] = useState(loadAsmrLockHash)
  const [asmrUnlocked, setAsmrUnlocked] = useState(loadAsmrUnlocked)
  const [asmrPasswordInput, setAsmrPasswordInput] = useState('')
  const [asmrPasswordConfirm, setAsmrPasswordConfirm] = useState('')
  const [asmrUnlockInput, setAsmrUnlockInput] = useState('')
  const youtubeFeed = useYouTubeNotifications(youtubeChannels, pushEnabled, youtubeApiKey)
  const xFeed = useXNotifications(xUsers, pushEnabled)
  const asmrFeed = useAsmrNotifications(pushEnabled, asmrVoiceFilters, asmrUnlocked)
  const splatoonFeed = useSplatoonStages()

  useEffect(() => saveXUsers(xUsers), [xUsers])
  useEffect(() => saveReadXItems([...readXItems]), [readXItems])
  useEffect(() => saveYouTubeChannels(youtubeChannels), [youtubeChannels])
  useEffect(() => saveYouTubeApiKey(youtubeApiKey), [youtubeApiKey])
  useEffect(() => saveReadYouTubeItems([...readYouTubeItems]), [readYouTubeItems])
  useEffect(() => saveReadAsmrItems([...readAsmrItems]), [readAsmrItems])
  useEffect(() => saveAsmrVoiceFilters(asmrVoiceFilters), [asmrVoiceFilters])

  const youtubeNotices = useMemo<Notice[]>(() => youtubeFeed.items.map((item) => ({
    id: getYouTubeReadId(item),
    source: item.channelName,
    initials: 'YT',
    accent: '#0f1419',
    category: 'YouTube',
    time: item.publishedText ?? (item.isLive ? '配信中' : item.isUpcoming ? '配信予定' : '新着'),
    title: item.title,
    body: item.body,
    unread: isRecentYouTubeItem(item) && !readYouTubeItems.has(getYouTubeReadId(item)),
    scheduled: item.kind === 'live' ? (item.isLive ? 'ライブ配信中' : '配信予定') : undefined,
    url: item.url,
    thumbnailUrl: item.thumbnailUrl,
    avatarUrl: item.avatarUrl,
  })), [readYouTubeItems, youtubeFeed.items])

  const xNotices = useMemo<Notice[]>(() => xFeed.items.map((item) => ({
    id: item.id,
    source: item.authorName,
    initials: 'X',
    accent: '#0f1419',
    category: 'X',
    time: formatXTime(item.createdAt),
    title: item.text || 'メディアを投稿しました',
    body: '',
    unread: isRecentXItem(item) && !readXItems.has(item.id),
    url: item.url,
    thumbnailUrl: item.thumbnailUrl,
    avatarUrl: item.avatarUrl,
    repostedBy: item.repostedByHandle ? { name: item.repostedByName ?? item.repostedByHandle, handle: item.repostedByHandle } : undefined,
  })), [readXItems, xFeed.items])

  const asmrNotices = useMemo<Notice[]>(() => asmrUnlocked ? asmrFeed.items.map((item) => ({
    id: item.id,
    source: item.author,
    initials: 'AS',
    accent: '#0f1419',
    category: 'ASMR',
    time: formatAsmrTime(item.publishedAt),
    title: item.title,
    body: '',
    unread: isRecentAsmrItem(item) && !readAsmrItems.has(item.id),
    url: item.url,
    urlLabel: '元記事を見る',
    secondaryUrl: item.dlsiteUrl,
    secondaryLabel: 'DLsiteで見る',
    thumbnailUrl: item.thumbnailUrl,
    asmrDetails: {
      source: item.source,
      voice: item.voice,
      maker: item.maker,
      scenario: item.scenario,
      illust: item.illust,
      price: item.price,
    },
  })) : [], [asmrFeed.items, asmrUnlocked, readAsmrItems])

  const splatoonNotices = useMemo<Notice[]>(() => splatoonFeed.items.length ? [{
    id: getSplatoonReadId(splatoonFeed.items),
    source: 'Splatoon 3',
    initials: 'S3',
    accent: '#0f1419',
    category: 'Splatoon',
    time: formatSplatoonEnd(splatoonFeed.items[0].endTime),
    title: '現在のステージ',
    body: '',
    unread: false,
    url: 'https://splatoon3.ink/',
    urlLabel: 'splatoon3.inkで見る',
    avatarUrl: splatoonIcon,
    splatoonDetails: { rotations: splatoonFeed.items },
  }] : [], [splatoonFeed.items])

  const allNotices = useMemo(() => [...youtubeNotices, ...xNotices, ...asmrNotices, ...splatoonNotices, ...notices], [asmrNotices, notices, splatoonNotices, xNotices, youtubeNotices])
  const nextYouTubeLive = youtubeFeed.items.find((item) => item.kind === 'live')

  const filteredNotices = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ja')
    return allNotices.filter((notice) => {
      const matchesFilter = enabledCategories.includes(notice.category) && (filter === 'すべて' || notice.category === filter)
      const matchesQuery = !normalized || `${notice.source}${notice.title}${notice.body}`.toLocaleLowerCase('ja').includes(normalized)
      return matchesFilter && matchesQuery
    })
  }, [allNotices, enabledCategories, filter, query])

  const unreadCount = allNotices.filter((notice) => notice.unread).length
  const feedError = filter === 'YouTube' ? youtubeFeed.error : filter === 'X' ? xFeed.error : filter === 'ASMR' ? asmrFeed.error : filter === 'Splatoon' ? splatoonFeed.error : ''

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  const toggleRead = (id: string) => {
    if (id.startsWith('youtube:')) {
      setReadYouTubeItems((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      return
    }
    if (id.startsWith('x:')) {
      setReadXItems((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      return
    }
    if (id.startsWith('asmr:')) {
      setReadAsmrItems((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      return
    }
    if (id.startsWith('splatoon:')) return
    setNotices((current) => current.map((notice) => notice.id === id ? { ...notice, unread: !notice.unread } : notice))
  }

  const markAllRead = () => {
    setNotices((current) => current.map((notice) => ({ ...notice, unread: false })))
    setReadYouTubeItems((current) => new Set([...current, ...youtubeFeed.items.map(getYouTubeReadId)]))
    setReadXItems((current) => new Set([...current, ...xFeed.items.map((item) => item.id)]))
    setReadAsmrItems((current) => new Set([...current, ...asmrFeed.items.map((item) => item.id)]))
    showToast('すべて既読にしました')
  }

  const addYouTubeChannel = () => {
    const value = youtubeChannelInput.trim()
    if (!isValidYouTubeChannel(value)) {
      showToast('@ハンドル、チャンネルID、URLを入力してください')
      return
    }
    if (youtubeChannels.includes(value)) {
      showToast('このチャンネルは登録済みです')
      return
    }
    setYoutubeChannels((current) => [...current, value])
    setYoutubeChannelInput('')
    showToast('YouTubeチャンネルを追加しました')
  }

  const addXUser = () => {
    const handle = normalizeXUser(xUserInput)
    if (!handle) {
      showToast('Xのユーザー名またはプロフィールURLを入力してください')
      return
    }
    if (xUsers.some((user) => user.toLocaleLowerCase('en') === handle.toLocaleLowerCase('en'))) {
      showToast('このXユーザーは登録済みです')
      return
    }
    setXUsers((current) => [...current, handle])
    setXUserInput('')
    showToast('Xユーザーを追加しました')
  }

  const addAsmrVoiceFilter = () => {
    const value = asmrVoiceInput.trim()
    if (!value) return
    if (asmrVoiceFilters.some((voice) => voice.toLocaleLowerCase('ja') === value.toLocaleLowerCase('ja'))) {
      showToast('この声優は追加済みです')
      return
    }
    setAsmrVoiceFilters((current) => [...current, value])
    setAsmrVoiceInput('')
    showToast('通知する声優を追加しました')
  }

  const setAsmrPassword = async () => {
    const value = asmrPasswordInput
    if (value.length < 4) {
      showToast('パスワードは4文字以上にしてください')
      return
    }
    if (value !== asmrPasswordConfirm) {
      showToast('パスワードが一致しません')
      return
    }
    const hash = await hashAsmrPassword(value)
    saveAsmrLockHash(hash)
    setAsmrLockHash(hash)
    setAsmrUnlocked(true)
    saveAsmrUnlocked()
    setAsmrPasswordInput('')
    setAsmrPasswordConfirm('')
    showToast('ASMRのパスワードを設定しました')
  }

  const unlockAsmr = async () => {
    const hash = await hashAsmrPassword(asmrUnlockInput)
    if (hash !== asmrLockHash) {
      showToast('パスワードが違います')
      return
    }
    setAsmrUnlocked(true)
    saveAsmrUnlocked()
    setAsmrUnlockInput('')
    showToast('ASMRのロックを解除しました')
  }

  const relockAsmr = () => {
    lockAsmr()
    setAsmrUnlocked(false)
    showToast('ASMRをロックしました')
  }

  const resetAsmrLock = () => {
    clearAsmrLock()
    setAsmrLockHash(null)
    setAsmrUnlocked(false)
    setAsmrUnlockInput('')
    showToast('ASMRのパスワードをリセットしました')
  }

  const updatePushEnabled = async (enabled: boolean) => {
    if (enabled) {
      if (!('Notification' in window)) {
        showToast('このブラウザは通知に対応していません')
        return
      }
      const permission = await window.Notification.requestPermission()
      if (permission !== 'granted') {
        showToast('ブラウザの通知許可が必要です')
        return
      }
    }
    setPushEnabled(enabled)
  }

  return (
    <div className="app-shell">
      <aside className={`side-nav ${mobileNavOpen ? 'is-open' : ''}`} aria-label="メインナビゲーション">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><BellRing size={22} strokeWidth={2.2} /></div>
          <div className="brand-copy">
            <strong>Roxy</strong>
            <span>Notice</span>
          </div>
          <button className="icon-button mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="メニューを閉じる">
            <X size={20} />
          </button>
        </div>

        <nav className="nav-list">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item ${activePage === id ? 'active' : ''}`}
              key={id}
              onClick={() => {
                setActivePage(id)
                setMobileNavOpen(false)
              }}
            >
              <Icon size={21} strokeWidth={activePage === id ? 2.4 : 1.9} />
              <span>{label}</span>
              {id === 'home' && unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
            </button>
          ))}
        </nav>

        <button className="new-rule-button" onClick={() => setActivePage('settings')}>
          <Settings size={19} />
          <span>通知設定を開く</span>
        </button>

      </aside>

      {mobileNavOpen && <button className="nav-scrim" aria-label="メニューを閉じる" onClick={() => setMobileNavOpen(false)} />}

      {activePage === 'home' ? <main className={`main-feed ${compactView ? 'compact-feed' : ''}`}>
        <header className="feed-header">
          <button className="icon-button menu-button" aria-label="メニューを開く" onClick={() => setMobileNavOpen(true)}><Menu size={21} /></button>
          <div>
            <h1>通知</h1>
            <p>{unreadCount > 0 ? `${unreadCount}件の未読があります` : 'すべて確認済みです'}</p>
          </div>
          <button className="text-button" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck size={17} />
            すべて既読
          </button>
        </header>

        <div className="mobile-search">
          <SearchBox query={query} onChange={setQuery} />
        </div>

        <div className="filter-bar" role="tablist" aria-label="通知の種類">
          {filters.map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item}>
              {item}
            </button>
          ))}
          <button className="filter-icon" aria-label="詳細フィルター" onClick={() => showToast('詳細フィルターは準備中です')}><Filter size={18} /></button>
        </div>

        {filter === 'YouTube' && youtubeChannels.length > 0 && (
          <div className={`youtube-sync-bar ${youtubeFeed.error ? 'has-error' : ''}`}>
            <div className="youtube-sync-copy">
              {youtubeFeed.loading ? <LoaderCircle className="spin" size={16} /> : <Youtube size={17} />}
              <span>{youtubeFeed.error || `${youtubeChannels.length}チャンネルを監視中`}</span>
              {youtubeFeed.lastUpdated && !youtubeFeed.error && <small>{youtubeFeed.lastUpdated.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 更新</small>}
            </div>
            <button className="icon-button small" onClick={youtubeFeed.refresh} aria-label="YouTube通知を再取得" disabled={youtubeFeed.loading}><RefreshCw size={16} /></button>
          </div>
        )}
        {filter === 'ASMR' && asmrUnlocked && (
          <div className={`youtube-sync-bar ${asmrFeed.error ? 'has-error' : ''}`}>
            <div className="youtube-sync-copy">
              {asmrFeed.loading ? <LoaderCircle className="spin" size={16} /> : <Headphones size={17} />}
              <span>{asmrFeed.error || asmrFeed.warnings[0] || '5分ごとに静的データを更新'}</span>
              {asmrFeed.lastUpdated && !asmrFeed.error && <small>{asmrFeed.lastUpdated.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })} 更新</small>}
            </div>
            <button className="icon-button small" onClick={asmrFeed.refresh} aria-label="ASMR通知を再取得" disabled={asmrFeed.loading}><RefreshCw size={16} /></button>
          </div>
        )}

        <section className="notice-list" aria-live="polite">
          {filter === 'ASMR' && !asmrUnlocked ? (
            <div className="empty-state asmr-lock">
              <Lock size={28} />
              <h2>{asmrLockHash ? 'ASMRはロックされています' : 'ASMRをパスワードで保護'}</h2>
              <p>{asmrLockHash ? 'パスワードを入力してロックを解除してください。' : '初回のみパスワードを設定すると、以降は表示されます。'}</p>
              <div className="asmr-lock-form">
                {asmrLockHash ? (
                  <>
                    <input
                      type="password"
                      value={asmrUnlockInput}
                      onChange={(event) => setAsmrUnlockInput(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && void unlockAsmr()}
                      placeholder="パスワード"
                      aria-label="ASMRのパスワード"
                      autoFocus
                    />
                    <button onClick={() => void unlockAsmr()} disabled={!asmrUnlockInput}>ロックを解除</button>
                  </>
                ) : (
                  <>
                    <input
                      type="password"
                      value={asmrPasswordInput}
                      onChange={(event) => setAsmrPasswordInput(event.target.value)}
                      placeholder="新しいパスワード（4文字以上）"
                      aria-label="ASMRの新しいパスワード"
                      autoFocus
                    />
                    <input
                      type="password"
                      value={asmrPasswordConfirm}
                      onChange={(event) => setAsmrPasswordConfirm(event.target.value)}
                      placeholder="パスワードを確認"
                      aria-label="ASMRのパスワード確認"
                    />
                    <button onClick={() => void setAsmrPassword()} disabled={!asmrPasswordInput || !asmrPasswordConfirm}>パスワードを設定して表示</button>
                  </>
                )}
              </div>
            </div>
          ) : filter === 'YouTube' && youtubeChannels.length === 0 ? (
            <div className="empty-state youtube-empty">
              <Youtube size={28} />
              <h2>YouTubeチャンネルを登録</h2>
              <p>APIキーを設定し、ライブ配信枠と新しい動画を5分ごとに確認します。</p>
              <button onClick={() => setActivePage('settings')}>設定を開く</button>
            </div>
          ) : filter === 'YouTube' && youtubeFeed.loading && !youtubeFeed.items.length ? (
            <div className="empty-state youtube-empty">
              <LoaderCircle className="spin" size={28} />
              <h2>YouTubeを確認しています</h2>
              <p>ライブ配信枠と投稿を取得中です。</p>
            </div>
          ) : filter === 'X' && xUsers.length === 0 ? (
            <div className="empty-state">
              <AtSign size={28} />
              <h2>Xユーザーを登録</h2>
              <p>新しい投稿を1分ごとに確認します。</p>
              <button onClick={() => setActivePage('settings')}>設定を開く</button>
            </div>
          ) : filter === 'X' && xFeed.loading && !xFeed.items.length ? (
            <div className="empty-state">
              <LoaderCircle className="spin" size={28} />
              <h2>Xを確認しています</h2>
              <p>投稿を取得中です。</p>
            </div>
          ) : filter === 'ASMR' && asmrFeed.loading && !asmrFeed.items.length ? (
            <div className="empty-state">
              <LoaderCircle className="spin" size={28} />
              <h2>ASMR作品を確認しています</h2>
              <p>GitHub Pagesの静的データを読み込んでいます。</p>
            </div>
          ) : filter === 'Splatoon' && splatoonFeed.loading && !splatoonFeed.items.length ? (
            <div className="empty-state">
              <LoaderCircle className="spin" size={28} />
              <h2>現在のステージを確認しています</h2>
              <p>splatoon3.inkからステージ情報を取得中です。</p>
            </div>
          ) : filteredNotices.length ? filteredNotices.map((notice) => (
            <article className={`notice-card ${notice.unread ? 'unread' : ''} ${notice.category === 'ASMR' ? 'asmr-notice' : ''} ${notice.category === 'Splatoon' ? 'splatoon-notice' : ''}`} key={notice.id}>
              <div className="notice-avatar" style={{ '--avatar-color': notice.accent } as React.CSSProperties}>
                {notice.avatarUrl ? <img src={notice.avatarUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : notice.initials}
              </div>
              <div className="notice-content">
                {notice.repostedBy && (
                  <div className="repost-attribution"><Repeat2 size={14} /><span>{notice.repostedBy.name}（@{notice.repostedBy.handle}）がリポスト</span></div>
                )}
                <div className="notice-meta">
                  <div><strong>{notice.source}</strong><span className="kind-label">{notice.category}</span><span>· {notice.time}</span></div>
                  {notice.category !== 'Splatoon' && (
                    <button className="icon-button small" aria-label={notice.unread ? '既読にする' : '未読に戻す'} onClick={() => toggleRead(notice.id)}>
                      {notice.unread ? <span className="unread-dot" /> : <Check size={17} />}
                    </button>
                  )}
                </div>
                {notice.category === 'X' ? <XPostText text={notice.title} /> : <h2>{notice.title}</h2>}
                {notice.asmrDetails ? <AsmrWorkDetails details={notice.asmrDetails} /> : notice.body && <p>{notice.body}</p>}
                {notice.splatoonDetails && <SplatoonStageDetails details={notice.splatoonDetails} />}
                {notice.category === 'X' ? (
                  <XLinkPreview text={notice.title} tweetUrl={notice.url} thumbnailUrl={notice.thumbnailUrl} />
                ) : notice.thumbnailUrl && (
                  <a className={`notice-media ${notice.category === 'ASMR' ? 'asmr-work-cover' : ''}`} href={notice.url} target="_blank" rel="noreferrer" aria-label={`${notice.title}の画像を見る`}>
                    <img src={notice.thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                  </a>
                )}
                {notice.scheduled && (
                  <div className="schedule-chip"><Clock3 size={14} /><span>{notice.scheduled}</span><span className="status-dot" /></div>
                )}
                <div className="notice-actions">
                  {notice.url ? <a href={notice.url} target="_blank" rel="noreferrer">{notice.urlLabel ?? (notice.category === 'X' ? 'Xで見る' : 'YouTubeで見る')} <ExternalLink size={13} /></a> : <button onClick={() => showToast('詳細画面はデモです')}>詳細を見る</button>}
                  {notice.secondaryUrl && <a href={notice.secondaryUrl} target="_blank" rel="noreferrer">{notice.secondaryLabel} <ExternalLink size={13} /></a>}
                  <button onClick={() => showToast('あとで見るに追加しました')}>あとで見る</button>
                </div>
              </div>
            </article>
          )) : (
            <div className="empty-state">
              <Search size={26} />
              <h2>{feedError ? `${filter}通知を取得できません` : '一致する通知はありません'}</h2>
              <p>{feedError || '検索語やフィルターを変えてみてください。'}</p>
              <button onClick={() => { setQuery(''); setFilter('すべて') }}>条件をクリア</button>
            </div>
          )}
        </section>
      </main> : (
        <main className="main-feed settings-page">
          <header className="feed-header settings-header">
            <button className="icon-button menu-button" aria-label="メニューを開く" onClick={() => setMobileNavOpen(true)}><Menu size={21} /></button>
            <div>
              <h1>設定</h1>
              <p>通知と表示を自分に合わせて調整</p>
            </div>
            <button className="save-settings-button" onClick={() => showToast('設定を保存しました')}>保存</button>
          </header>

          <div className="settings-intro">
            <span className="eyebrow">PREFERENCES</span>
            <h2>通知を、ちょうどいい量に。</h2>
            <p>XとYouTubeは新着をすべて通知し、ASMRは指定した声優だけ通知します。Splatoonは一覧表示のみです。</p>
          </div>

          <div className="settings-groups">
            <section className="settings-group" aria-labelledby="delivery-heading">
              <div className="settings-group-heading">
                <div className="settings-icon"><Bell size={19} /></div>
                <div><h2 id="delivery-heading">通知の受け取り方</h2><p>更新を受け取る場所を選択</p></div>
              </div>
              <div className="settings-rows">
                <ToggleRow label="アプリ内通知" caption="Roxy Noticeを開いているときに表示" enabled={inAppEnabled} onChange={setInAppEnabled} />
                <ToggleRow label="ブラウザ通知" caption="新着をこの端末へすぐに通知" enabled={pushEnabled} onChange={updatePushEnabled} />
              </div>
            </section>

            <section className="settings-group" aria-labelledby="youtube-heading">
              <div className="settings-group-heading">
                <div className="settings-icon"><Youtube size={19} /></div>
                <div><h2 id="youtube-heading">YouTubeチャンネル</h2><p>ブラウザから5分ごとに確認</p></div>
                {youtubeFeed.loading && <LoaderCircle className="spin" size={18} />}
              </div>
              <div className="youtube-channel-settings">
                <div className="channel-input-row">
                  <input
                    type="password"
                    value={youtubeApiKey}
                    onChange={(event) => setYouTubeApiKey(event.target.value)}
                    placeholder="YouTube Data APIキー"
                    aria-label="YouTube Data APIキー"
                    autoComplete="off"
                  />
                </div>
                <div className="channel-input-row">
                  <input
                    value={youtubeChannelInput}
                    onChange={(event) => setYoutubeChannelInput(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && addYouTubeChannel()}
                    placeholder="@ハンドル または チャンネルURL"
                    aria-label="YouTubeチャンネル"
                  />
                  <button onClick={addYouTubeChannel} disabled={!youtubeChannelInput.trim()}>追加</button>
                </div>
                {youtubeChannels.length > 0 ? (
                  <div className="channel-list">
                    {youtubeChannels.map((channel) => (
                      <div className="channel-row" key={channel}>
                        <Youtube size={16} />
                        <span>{channel}</span>
                        <button onClick={() => setYoutubeChannels((current) => current.filter((value) => value !== channel))} aria-label={`${channel}を削除`}><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                ) : <p className="channel-help">登録するとYouTubeタブに実際のライブ配信枠と投稿が表示されます。</p>}
                {youtubeFeed.warnings.length > 0 && <p className="channel-warning">{youtubeFeed.warnings[0]}</p>}
                <p className="unofficial-note">APIキーはこのブラウザだけに保存されます。Google CloudでHTTPリファラーをこのPages URLに制限してください。コミュニティ投稿は公式APIの対象外です。</p>
                <p className="unofficial-note">登録チャンネルで取得できた新着動画・ライブは、種類を問わずすべて通知します。</p>
              </div>
            </section>

            <section className="settings-group" aria-labelledby="asmr-voice-heading">
              <div className="settings-group-heading">
                <div className="settings-icon"><Headphones size={19} /></div>
                <div><h2 id="asmr-voice-heading">ASMR声優</h2><p>指定した声優の新着作品だけ通知</p></div>
                {asmrFeed.loading && <LoaderCircle className="spin" size={18} />}
              </div>
              <div className="youtube-channel-settings">
                <div className="channel-input-row">
                  <input
                    value={asmrVoiceInput}
                    onChange={(event) => setAsmrVoiceInput(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && addAsmrVoiceFilter()}
                    placeholder="例：秋野かえで"
                    aria-label="通知するASMR声優"
                  />
                  <button onClick={addAsmrVoiceFilter} disabled={!asmrVoiceInput.trim()}>追加</button>
                </div>
                {asmrVoiceFilters.length > 0 ? (
                  <div className="channel-list">
                    {asmrVoiceFilters.map((voice) => (
                      <div className="channel-row" key={voice}>
                        <Headphones size={16} />
                        <span>{voice}</span>
                        <button onClick={() => setAsmrVoiceFilters((current) => current.filter((value) => value !== voice))} aria-label={`${voice}を削除`}><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                ) : <p className="channel-help">声優を追加するまでASMRのブラウザ通知は届きません。</p>}
                <p className="unofficial-note">声優名の一部でも一致します。作品一覧にはすべての作品を表示します。</p>
              </div>
            </section>

            <section className="settings-group" aria-labelledby="asmr-lock-heading">
              <div className="settings-group-heading">
                <div className="settings-icon"><Lock size={19} /></div>
                <div><h2 id="asmr-lock-heading">ASMRロック</h2><p>初回はパスワードを設定すると表示</p></div>
              </div>
              <div className="youtube-channel-settings">
                <div className="channel-list">
                  <div className="channel-row">
                    <Lock size={16} />
                    <span>{asmrLockHash === null ? '未設定 — ASMRタブでパスワードを設定します' : asmrUnlocked ? '解除済み — ASMRを表示中' : 'ロック中 — パスワードが必要です'}</span>
                  </div>
                </div>
                {asmrLockHash !== null && (
                  <div className="asmr-lock-actions">
                    {asmrUnlocked && <button onClick={relockAsmr}>ロックし直す</button>}
                    <button onClick={resetAsmrLock}>パスワードをリセット</button>
                  </div>
                )}
                <p className="unofficial-note">パスワードはSHA-256ハッシュとしてこのブラウザだけに保存されます。ロック中はASMRの新着通知も届きません。</p>
              </div>
            </section>

            <section className="settings-group" aria-labelledby="x-heading">
              <div className="settings-group-heading">
                <div className="settings-icon"><AtSign size={19} /></div>
                <div><h2 id="x-heading">Xユーザー</h2><p>画面を開いている間、1分ごとに確認</p></div>
                {xFeed.loading && <LoaderCircle className="spin" size={18} />}
              </div>
              <div className="youtube-channel-settings">
                <div className="channel-input-row">
                  <input
                    value={xUserInput}
                    onChange={(event) => setXUserInput(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && addXUser()}
                    placeholder="@ユーザー名 または プロフィールURL"
                    aria-label="Xユーザー"
                  />
                  <button onClick={addXUser} disabled={!xUserInput.trim()}>追加</button>
                </div>
                {xUsers.length > 0 ? (
                  <div className="channel-list">
                    {xUsers.map((user) => {
                      const profile = xFeed.profiles.find((item) => item.handle.toLocaleLowerCase('en') === user.toLocaleLowerCase('en'))
                      return (
                        <div className="channel-row" key={user}>
                          <AtSign size={16} />
                          <span>{profile ? `${profile.displayName}（@${profile.handle}）` : `@${user}`}</span>
                          <button onClick={() => setXUsers((current) => current.filter((value) => value !== user))} aria-label={`@${user}を削除`}><Trash2 size={15} /></button>
                        </div>
                      )
                    })}
                  </div>
                ) : <p className="channel-help">登録するとXタブに実際の投稿が表示されます。</p>}
                {(xFeed.error || xFeed.warnings[0]) && <p className="channel-warning">{xFeed.error || xFeed.warnings[0]}</p>}
                <p className="unofficial-note">返信・リポストを含む、取得できた新着投稿をすべて通知します。非公式APIのため、X側の変更により一時的に取得できない場合があります。</p>
              </div>
            </section>

            <section className="settings-group" aria-labelledby="static-edition-heading">
              <div className="settings-group-heading">
                <div className="settings-icon"><RefreshCw size={19} /></div>
                <div><h2 id="static-edition-heading">サーバー不要版</h2><p>GitHub Pagesとブラウザだけで更新</p></div>
              </div>
              <p className="unofficial-note">YouTubeは利用者自身のData APIキー、Xは公開タイムラインAPIをブラウザから使用します。Splatoonは通知せず1分ごとに表示を更新し、ASMRはGitHub Actionsで作品情報を更新します。</p>
            </section>

            <section className="settings-group" aria-labelledby="category-heading">
              <div className="settings-group-heading">
                <div className="settings-icon"><Bell size={19} /></div>
                <div><h2 id="category-heading">ホームに表示するカテゴリー</h2><p>通知一覧に表示する種類を選択</p></div>
              </div>
              <div className="category-settings">
                {filters.slice(1).map((item) => {
                  const category = item as Exclude<NoticeCategory, 'すべて'>
                  const enabled = enabledCategories.includes(category)
                  return (
                    <button
                      className={`category-setting ${enabled ? 'active' : ''}`}
                      key={category}
                      aria-pressed={enabled}
                      onClick={() => setEnabledCategories((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category])}
                    >
                      <span>{category}</span><Check size={15} />
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="settings-group" aria-labelledby="display-heading">
              <div className="settings-group-heading">
                <div className="settings-icon"><Eye size={19} /></div>
                <div><h2 id="display-heading">表示</h2><p>通知一覧の見え方を変更</p></div>
              </div>
              <div className="settings-rows single-row">
                <ToggleRow label="コンパクト表示" caption="通知間の余白を小さくする" enabled={compactView} onChange={setCompactView} />
              </div>
            </section>
          </div>

          <div className="settings-footer-actions">
            <span>チャンネル、Xユーザー、ASMR声優の設定は、このブラウザに自動保存されます。</span>
          </div>
        </main>
      )}

      <aside className="right-rail" aria-label="通知の補助情報">
        {activePage === 'home' ? <>
        <SearchBox query={query} onChange={setQuery} />

        <section className="rail-section upcoming-card">
          <div className="section-heading">
            <div><span className="eyebrow">UP NEXT</span><h2>今日の予定</h2></div>
            <CalendarDays size={19} />
          </div>
          {nextYouTubeLive ? <>
            <div className="time-row">
              <div className="time-block"><strong>{nextYouTubeLive.isLive ? 'LIVE' : '予定'}</strong><span>{nextYouTubeLive.publishedText ?? '公開済み'}</span></div>
              <div className="time-detail"><strong>{nextYouTubeLive.channelName}</strong><span>{nextYouTubeLive.title}</span></div>
            </div>
            <a className="outline-button" href={nextYouTubeLive.url} target="_blank" rel="noreferrer">YouTubeで見る</a>
          </> : <>
            <div className="no-upcoming"><strong>ライブ予定はありません</strong><span>{youtubeChannels.length ? '次の取得時に自動で更新します。' : '設定からチャンネルを登録してください。'}</span></div>
            <button className="outline-button" onClick={() => setActivePage('settings')}>YouTube設定を開く</button>
          </>}
        </section>

        <section className="rail-section settings-card">
          <div className="section-heading">
            <div><span className="eyebrow">DELIVERY</span><h2>通知の受け取り方</h2></div>
            <Settings size={19} />
          </div>
          <ToggleRow label="ブラウザ通知" caption="新着をこの端末に表示" enabled={pushEnabled} onChange={updatePushEnabled} />
          <p className="demo-note">X投稿は1分ごと、YouTube・ASMRは5分ごとに確認します。Splatoonは表示だけを1分ごとに更新します。</p>
        </section>

        <footer className="rail-footer">X投稿は1分ごと、YouTube・ASMRは5分ごとに確認。Splatoonは表示のみ更新します。</footer>
        </> : <>
          <section className="rail-section settings-summary-card">
            <div className="section-heading">
              <div><span className="eyebrow">STATUS</span><h2>現在の設定</h2></div>
              <Settings size={19} />
            </div>
            <div className="summary-list">
              <div><Smartphone size={16} /><span>プッシュ</span><strong>{pushEnabled ? 'オン' : 'オフ'}</strong></div>
              <div><Youtube size={16} /><span>YouTube</span><strong>{youtubeChannels.length}件</strong></div>
              <div><AtSign size={16} /><span>X</span><strong>{xUsers.length}件</strong></div>
              <div><Headphones size={16} /><span>ASMR声優</span><strong>{asmrVoiceFilters.length}名</strong></div>
            </div>
          </section>

          <footer className="rail-footer">YouTubeチャンネル、Xユーザー、ASMR声優の設定は、このブラウザに保存されます。</footer>
        </>}
      </aside>

      {activePage === 'home' && <button className="mobile-fab" aria-label="通知設定を開く" onClick={() => setActivePage('settings')}><Plus size={24} /></button>}

      <div className={`toast ${toast ? 'show' : ''}`} role="status"><Check size={17} />{toast}</div>
    </div>
  )
}

function SearchBox({ query, onChange }: { query: string; onChange: (value: string) => void }) {
  return (
    <label className="search-box">
      <Search size={18} />
      <input value={query} onChange={(event) => onChange(event.target.value)} placeholder="通知を検索" aria-label="通知を検索" />
      {query && <button aria-label="検索をクリア" onClick={() => onChange('')}><X size={16} /></button>}
    </label>
  )
}

function SplatoonStageDetails({ details }: { details: NonNullable<Notice['splatoonDetails']> }) {
  return (
    <section className="splatoon-stage-details" aria-label="現在のステージ一覧">
      {details.rotations.map((rotation) => (
        <div className="splatoon-rotation" key={rotation.id}>
          <div className="splatoon-stage-heading">
            <div>
              {rotation.ruleImageUrl && <span className="splatoon-rule-icon"><img src={rotation.ruleImageUrl} alt="" loading="lazy" decoding="async" /></span>}
              <span className="splatoon-rule-copy"><strong>{rotation.mode}</strong><span>{rotation.rule}</span></span>
            </div>
            <small>{formatSplatoonEnd(rotation.endTime)}</small>
          </div>
          <div className="splatoon-stage-grid">
            {rotation.stages.map((stage) => (
              <figure key={stage.id}>
                {stage.imageUrl ? <img src={stage.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <div className="splatoon-stage-placeholder">画像なし</div>}
                <figcaption>{stage.name}</figcaption>
              </figure>
            ))}
          </div>
          {(rotation.boss || rotation.weapons?.length) && (
            <div className="salmon-loadout">
              {rotation.boss && (
                <figure className="salmon-boss">
                  <span>オカシラ</span>
                  {rotation.boss.imageUrl && <img src={rotation.boss.imageUrl} alt="" loading="lazy" decoding="async" />}
                  <figcaption>{rotation.boss.name}</figcaption>
                </figure>
              )}
              {rotation.weapons?.length ? (
                <div className="salmon-weapons">
                  <strong>支給ブキ</strong>
                  <div>
                    {rotation.weapons.map((weapon, index) => (
                      <figure key={`${weapon.name}-${index}`}>
                        {weapon.imageUrl && <img src={weapon.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
                        <figcaption>{weapon.name}</figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}

function AsmrWorkDetails({ details }: { details: NonNullable<Notice['asmrDetails']> }) {
  const facts = [
    ['声優', details.voice.join('、')],
    ['サークル', details.maker],
    ['シナリオ', details.scenario.join('、')],
    ['イラスト', details.illust.join('、')],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]))

  return (
    <section className="asmr-work-details" aria-label="作品情報">
      {facts.length > 0 && (
        <dl>
          {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      )}
      <div className="asmr-work-footer">
        <span>{details.source}</span>
        {details.price !== null && <strong>{details.price.toLocaleString('ja-JP')}円</strong>}
      </div>
    </section>
  )
}

function XPostText({ text }: { text: string }) {
  return (
    <p className="x-post-text">
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => part.startsWith('http')
        ? <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">{part.replace(/^https?:\/\//, '')}</a>
        : part)}
    </p>
  )
}

function firstUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s]+/)
  return match?.[0].replace(/[),.!?;:'"…。、！？）」』】]+$/u, '') ?? null
}

function youtubeThumbnail(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLocaleLowerCase('en').replace(/^www\./, '')
    const videoId = host === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : ['youtube.com', 'm.youtube.com'].includes(host)
        ? url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1]
        : null
    return videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null
  } catch {
    return null
  }
}

function linkDomain(value: string) {
  try {
    const host = new URL(value).hostname.toLocaleLowerCase('en').replace(/^www\./, '')
    return host === 'youtu.be' || host === 'm.youtube.com' ? 'youtube.com' : host
  } catch {
    return value
  }
}

function XLinkPreview({ text, tweetUrl, thumbnailUrl }: { text: string; tweetUrl?: string; thumbnailUrl?: string | null }) {
  const [imageFailed, setImageFailed] = useState(false)
  const linkUrl = firstUrl(text)

  if (!linkUrl) {
    return thumbnailUrl && tweetUrl ? (
      <a className="notice-media x-media" href={tweetUrl} target="_blank" rel="noreferrer" aria-label="投稿画像を見る">
        <img src={thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      </a>
    ) : null
  }

  const previewImage = thumbnailUrl ?? youtubeThumbnail(linkUrl)
  return (
    <a className="x-link-preview" href={linkUrl} target="_blank" rel="noreferrer" aria-label={`${linkDomain(linkUrl)}のリンクを開く`}>
      {previewImage && !imageFailed && <img src={previewImage} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />}
      <span>{linkDomain(linkUrl)}から</span>
    </a>
  )
}

function ToggleRow({ label, caption, enabled, onChange }: { label: string; caption: string; enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <div className="toggle-row">
      <div><strong>{label}</strong><span>{caption}</span></div>
      <button className={`switch ${enabled ? 'enabled' : ''}`} role="switch" aria-checked={enabled} aria-label={label} onClick={() => onChange(!enabled)}><span /></button>
    </div>
  )
}

export default App
