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
  Mail,
  Menu,
  Plus,
  RefreshCw,
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
  loadYouTubeChannels,
  loadYouTubeExcludedWords,
  saveReadYouTubeItems,
  saveYouTubeChannels,
  saveYouTubeExcludedWords,
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
  formatAsmrTime,
  isRecentAsmrItem,
  loadReadAsmrItems,
  saveReadAsmrItems,
  useAsmrNotifications,
} from './asmr'
import {
  formatSplatoonEnd,
  getSplatoonReadId,
  loadReadSplatoonItems,
  saveReadSplatoonItems,
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

const filters: NoticeCategory[] = ['すべて', 'ASMR', 'Splatoon']
const supportsPersonalSources = false

function App() {
  const [notices, setNotices] = useState(initialNotices)
  const [filter, setFilter] = useState<NoticeCategory>('すべて')
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [inAppEnabled, setInAppEnabled] = useState(true)
  const [compactView, setCompactView] = useState(false)
  const [enabledCategories, setEnabledCategories] = useState<Array<Exclude<NoticeCategory, 'すべて'>>>(['ASMR', 'Splatoon'])
  const [activePage, setActivePage] = useState<'home' | 'settings'>('home')
  const [xUsers, setXUsers] = useState(loadXUsers)
  const [xUserInput, setXUserInput] = useState('')
  const [readXItems, setReadXItems] = useState(() => new Set(loadReadXItems()))
  const [youtubeChannels, setYoutubeChannels] = useState(loadYouTubeChannels)
  const [youtubeChannelInput, setYoutubeChannelInput] = useState('')
  const [youtubeExcludedWords, setYouTubeExcludedWords] = useState(loadYouTubeExcludedWords)
  const [youtubeExcludedWordInput, setYouTubeExcludedWordInput] = useState('')
  const [readYouTubeItems, setReadYouTubeItems] = useState(() => new Set(loadReadYouTubeItems()))
  const [readAsmrItems, setReadAsmrItems] = useState(() => new Set(loadReadAsmrItems()))
  const [readSplatoonItems, setReadSplatoonItems] = useState(() => new Set(loadReadSplatoonItems()))
  const youtubeFeed = useYouTubeNotifications(youtubeChannels, pushEnabled, youtubeExcludedWords)
  const xFeed = useXNotifications(xUsers, pushEnabled)
  const asmrFeed = useAsmrNotifications(pushEnabled)
  const splatoonFeed = useSplatoonStages(pushEnabled)

  useEffect(() => saveXUsers(xUsers), [xUsers])
  useEffect(() => saveReadXItems([...readXItems]), [readXItems])
  useEffect(() => saveYouTubeChannels(youtubeChannels), [youtubeChannels])
  useEffect(() => saveYouTubeExcludedWords(youtubeExcludedWords), [youtubeExcludedWords])
  useEffect(() => saveReadYouTubeItems([...readYouTubeItems]), [readYouTubeItems])
  useEffect(() => saveReadAsmrItems([...readAsmrItems]), [readAsmrItems])
  useEffect(() => saveReadSplatoonItems([...readSplatoonItems]), [readSplatoonItems])

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
  })), [readXItems, xFeed.items])

  const asmrNotices = useMemo<Notice[]>(() => asmrFeed.items.map((item) => ({
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
  })), [asmrFeed.items, readAsmrItems])

  const splatoonNotices = useMemo<Notice[]>(() => splatoonFeed.items.length ? [{
    id: getSplatoonReadId(splatoonFeed.items),
    source: 'Splatoon 3',
    initials: 'S3',
    accent: '#0f1419',
    category: 'Splatoon',
    time: formatSplatoonEnd(splatoonFeed.items[0].endTime),
    title: '現在のステージ',
    body: '',
    unread: !readSplatoonItems.has(getSplatoonReadId(splatoonFeed.items)),
    url: 'https://splatoon3.ink/',
    urlLabel: 'splatoon3.inkで見る',
    avatarUrl: splatoonIcon,
    splatoonDetails: { rotations: splatoonFeed.items },
  }] : [], [readSplatoonItems, splatoonFeed.items])

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
    if (id.startsWith('splatoon:')) {
      setReadSplatoonItems((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      return
    }
    setNotices((current) => current.map((notice) => notice.id === id ? { ...notice, unread: !notice.unread } : notice))
  }

  const markAllRead = () => {
    setNotices((current) => current.map((notice) => ({ ...notice, unread: false })))
    setReadYouTubeItems((current) => new Set([...current, ...youtubeFeed.items.map(getYouTubeReadId)]))
    setReadXItems((current) => new Set([...current, ...xFeed.items.map((item) => item.id)]))
    setReadAsmrItems((current) => new Set([...current, ...asmrFeed.items.map((item) => item.id)]))
    if (splatoonFeed.items.length) setReadSplatoonItems((current) => new Set([...current, getSplatoonReadId(splatoonFeed.items)]))
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

  const addYouTubeExcludedWord = () => {
    const value = youtubeExcludedWordInput.trim()
    if (!value) return
    if (youtubeExcludedWords.some((word) => word.toLocaleLowerCase('ja') === value.toLocaleLowerCase('ja'))) {
      showToast('この除外ワードは追加済みです')
      return
    }
    setYouTubeExcludedWords((current) => [...current, value])
    setYouTubeExcludedWordInput('')
    showToast('除外ワードを追加しました')
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

        <button className="new-rule-button" onClick={() => setModalOpen(true)}>
          <Plus size={19} />
          <span>通知ルールを作成</span>
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
        {filter === 'ASMR' && (
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
          {filter === 'YouTube' && youtubeChannels.length === 0 ? (
            <div className="empty-state youtube-empty">
              <Youtube size={28} />
              <h2>YouTubeチャンネルを登録</h2>
              <p>ライブ配信枠と新しい投稿を1分ごとに確認します。</p>
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
                <div className="notice-meta">
                  <div><strong>{notice.source}</strong><span className="kind-label">{notice.category}</span><span>· {notice.time}</span></div>
                  <button className="icon-button small" aria-label={notice.unread ? '既読にする' : '未読に戻す'} onClick={() => toggleRead(notice.id)}>
                    {notice.unread ? <span className="unread-dot" /> : <Check size={17} />}
                  </button>
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
            <p>通知方法はいつでも変更できます。登録したYouTubeチャンネルとXユーザーは、このブラウザに保存されます。</p>
          </div>

          <div className="settings-groups">
            <section className="settings-group" aria-labelledby="delivery-heading">
              <div className="settings-group-heading">
                <div className="settings-icon"><Mail size={19} /></div>
                <div><h2 id="delivery-heading">通知の受け取り方</h2><p>更新を受け取る場所を選択</p></div>
              </div>
              <div className="settings-rows">
                <ToggleRow label="アプリ内通知" caption="Roxy Noticeを開いているときに表示" enabled={inAppEnabled} onChange={setInAppEnabled} />
                <ToggleRow label="メール通知" caption="重要な更新をまとめて受信" enabled={emailEnabled} onChange={setEmailEnabled} />
                <ToggleRow label="ブラウザ通知" caption="新着をこの端末へすぐに通知" enabled={pushEnabled} onChange={updatePushEnabled} />
              </div>
            </section>

            {supportsPersonalSources && <>
            <section className="settings-group" aria-labelledby="youtube-heading">
              <div className="settings-group-heading">
                <div className="settings-icon"><Youtube size={19} /></div>
                <div><h2 id="youtube-heading">YouTubeチャンネル</h2><p>画面を開いている間、1分ごとに確認</p></div>
                {youtubeFeed.loading && <LoaderCircle className="spin" size={18} />}
              </div>
              <div className="youtube-channel-settings">
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
                <p className="unofficial-note">非公式APIを使用するため、YouTube側の変更により一時的に取得できない場合があります。</p>
                <div className="exclude-word-settings">
                  <strong>ライブ予定の除外ワード</strong>
                  <p>タイトルに含まれるライブ予定を表示・通知しません。</p>
                  <div className="channel-input-row">
                    <input
                      value={youtubeExcludedWordInput}
                      onChange={(event) => setYouTubeExcludedWordInput(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && addYouTubeExcludedWord()}
                      placeholder="例：メンバー限定"
                      aria-label="ライブ予定の除外ワード"
                    />
                    <button onClick={addYouTubeExcludedWord} disabled={!youtubeExcludedWordInput.trim()}>追加</button>
                  </div>
                  {youtubeExcludedWords.length > 0 && (
                    <div className="channel-list">
                      {youtubeExcludedWords.map((word) => (
                        <div className="channel-row" key={word}>
                          <Filter size={16} />
                          <span>{word}</span>
                          <button onClick={() => setYouTubeExcludedWords((current) => current.filter((value) => value !== word))} aria-label={`除外ワード「${word}」を削除`}><Trash2 size={15} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
                <p className="unofficial-note">非公式APIを使用するため、X側の変更により一時的に取得できない場合があります。</p>
              </div>
            </section>
            </>}

            <section className="settings-group" aria-labelledby="static-edition-heading">
              <div className="settings-group-heading">
                <div className="settings-icon"><RefreshCw size={19} /></div>
                <div><h2 id="static-edition-heading">サーバー不要版</h2><p>ASMRとSplatoonを5分ごとに自動更新</p></div>
              </div>
              <p className="unofficial-note">YouTubeとXはブラウザごとの登録内容を外部サイトへ代理照会するサーバーが必要なため、この版では対象外です。</p>
            </section>

            <section className="settings-group" aria-labelledby="category-heading">
              <div className="settings-group-heading">
                <div className="settings-icon"><Bell size={19} /></div>
                <div><h2 id="category-heading">通知するカテゴリー</h2><p>ホームに表示する通知を選択</p></div>
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
            <button onClick={() => showToast('デモのため初期化は行われません')}>初期設定に戻す</button>
            <span>変更内容はこのデモ画面内でのみ反映されます。</span>
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
          <ToggleRow label="メール通知" caption="重要な更新だけ" enabled={emailEnabled} onChange={setEmailEnabled} />
          <ToggleRow label="ブラウザ通知" caption="新着をこの端末に表示" enabled={pushEnabled} onChange={updatePushEnabled} />
          <p className="demo-note">YouTube・X・Splatoonは1分ごと、ASMRは5分ごとに確認します。</p>
        </section>

        <footer className="rail-footer">YouTube・X・Splatoonは1分ごと、ASMRは5分ごとに確認します。</footer>
        </> : <>
          <section className="rail-section settings-summary-card">
            <div className="section-heading">
              <div><span className="eyebrow">STATUS</span><h2>現在の設定</h2></div>
              <Settings size={19} />
            </div>
            <div className="summary-list">
              <div><Mail size={16} /><span>メール</span><strong>{emailEnabled ? 'オン' : 'オフ'}</strong></div>
              <div><Smartphone size={16} /><span>プッシュ</span><strong>{pushEnabled ? 'オン' : 'オフ'}</strong></div>
              <div><Youtube size={16} /><span>YouTube</span><strong>{youtubeChannels.length}件</strong></div>
              <div><AtSign size={16} /><span>X</span><strong>{xUsers.length}件</strong></div>
              <div><Headphones size={16} /><span>ASMR</span><strong>3サイト</strong></div>
            </div>
          </section>

          <footer className="rail-footer">YouTubeチャンネルとXユーザーの設定は、このブラウザに保存されます。</footer>
        </>}
      </aside>

      {activePage === 'home' && <button className="mobile-fab" aria-label="通知ルールを作成" onClick={() => setModalOpen(true)}><Plus size={24} /></button>}

      {modalOpen && (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModalOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-header">
              <div><span className="eyebrow">NEW RULE</span><h2 id="modal-title">通知ルールを作成</h2></div>
              <button className="icon-button" onClick={() => setModalOpen(false)} aria-label="閉じる"><X size={20} /></button>
            </div>
            <label>通知したい名前・キーワード<input type="text" placeholder="例：Roxy Studio" autoFocus /></label>
            <label>通知の種類<select defaultValue="すべての更新"><option>すべての更新</option><option>配信予定</option><option>記事の更新</option><option>重要なお知らせ</option></select></label>
            <div className="modal-note"><Bell size={18} /><p>これは画面操作を確認するためのデモです。実際の監視や通知送信は行われません。</p></div>
            <div className="modal-actions"><button className="cancel-button" onClick={() => setModalOpen(false)}>キャンセル</button><button className="primary-button" onClick={() => { setModalOpen(false); showToast('デモの通知ルールを作成しました') }}>作成する</button></div>
          </section>
        </div>
      )}

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
