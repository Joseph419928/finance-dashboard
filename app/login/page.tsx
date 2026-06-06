import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = typeof searchParams.next === 'string' ? searchParams.next : '/dashboard'
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-6">
      <div className="card w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="text-xl font-bold text-green-600">財務管理系統</div>
          <div className="text-xs text-slate-400 mt-1">請輸入密碼登入</div>
        </div>
        <LoginForm next={next} />
      </div>
    </div>
  )
}
