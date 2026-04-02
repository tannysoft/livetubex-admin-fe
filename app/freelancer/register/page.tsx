'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  UserCircleIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  IdentificationIcon,
  PhotoIcon,
  CameraIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useForm } from 'react-hook-form'
import Logo from '@/components/ui/Logo'
import { initLiff, isLiffLoggedIn, liffLogin, signInFirebaseWithLiff } from '@/lib/line-liff'
import { getFreelancerByLineId, upsertFreelancerByLineId } from '@/lib/firebase-utils'
import { uploadIdCardImage } from '@/lib/firebase-storage'

type FormData = {
  namePrefix: string
  firstName: string
  lastName: string
  phone: string
  email: string
  bankName: string
  bankAccount: string
}

const bankOptions = [
  'ธนาคารกสิกรไทย (KBANK)',
  'ธนาคารไทยพาณิชย์ (SCB)',
  'ธนาคารกรุงเทพ (BBL)',
  'ธนาคารกรุงไทย (KTB)',
  'ธนาคารกรุงศรีอยุธยา (BAY)',
  'ธนาคารทหารไทยธนชาต (TTB)',
  'ธนาคารออมสิน (GSB)',
  'ธนาคาร ธ.ก.ส.',
  'ธนาคารซีไอเอ็มบี (CIMB)',
  'ธนาคารยูโอบี (UOB)',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

type PageState = 'loading' | 'not-logged-in' | 'form' | 'saving' | 'success' | 'error'

export default function FreelancerRegisterPage() {
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [liffProfile, setLiffProfile] = useState<{
    userId: string
    displayName: string
    pictureUrl?: string
  } | null>(null)
  const [isEdit, setIsEdit] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // ID card image states
  const [idCardFile, setIdCardFile] = useState<File | null>(null)
  const [idCardPreview, setIdCardPreview] = useState<string>('') // blob URL or existing URL
  const [existingIdCardUrl, setExistingIdCardUrl] = useState<string>('')
  const [idCardError, setIdCardError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)       // gallery
  const cameraInputRef = useRef<HTMLInputElement>(null)     // camera

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: { namePrefix: 'นาย', firstName: '', lastName: '', phone: '', email: '', bankName: '', bankAccount: '' },
  })

  useEffect(() => {
    async function init() {
      try {
        await initLiff()
        const loggedIn = await isLiffLoggedIn()
        if (!loggedIn) {
          setPageState('not-logged-in')
          return
        }

        const profile = await signInFirebaseWithLiff()
        setLiffProfile(profile)

        const existing = await getFreelancerByLineId(profile.userId)
        if (existing) {
          setIsEdit(true)
          reset({
            namePrefix: existing.namePrefix || 'นาย',
            firstName: existing.firstName || '',
            lastName: existing.lastName || '',
            phone: existing.phone,
            email: existing.email ?? '',
            bankName: existing.bankName,
            bankAccount: existing.bankAccount,
          })
          if (existing.idCardImageUrl) {
            setExistingIdCardUrl(existing.idCardImageUrl)
            setIdCardPreview(existing.idCardImageUrl)
          }
        }

        setPageState('form')
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
        setPageState('error')
      }
    }
    init()
  }, [reset])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIdCardError('')

    if (!ACCEPT_TYPES.includes(file.type)) {
      setIdCardError('รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP, HEIC)')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setIdCardError('ขนาดไฟล์ต้องไม่เกิน 10 MB')
      return
    }

    setIdCardFile(file)
    const blobUrl = URL.createObjectURL(file)
    setIdCardPreview(blobUrl)
  }

  const handleRemoveImage = () => {
    setIdCardFile(null)
    setIdCardPreview(existingIdCardUrl) // คืนรูปเดิม (ถ้ามี)
    setIdCardError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const onSubmit = async (data: FormData) => {
    if (!liffProfile) return

    // Validate: ถ้าเป็นการสมัครใหม่ ต้องมีรูปบัตร
    if (!isEdit && !idCardFile) {
      setIdCardError('กรุณาอัพโหลดสำเนาบัตรประชาชน')
      return
    }

    setPageState('saving')
    try {
      let idCardImageUrl = existingIdCardUrl

      // อัพโหลดรูปใหม่ถ้ามีการเปลี่ยน
      if (idCardFile) {
        setUploadProgress(true)
        idCardImageUrl = await uploadIdCardImage(liffProfile.userId, idCardFile)
        setUploadProgress(false)
      }

      await upsertFreelancerByLineId(liffProfile.userId, {
        lineDisplayName: liffProfile.displayName,
        linePictureUrl: liffProfile.pictureUrl,
        namePrefix: data.namePrefix,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
        bankAccount: data.bankAccount,
        bankName: data.bankName,
        idCardImageUrl,
      })
      setPageState('success')
    } catch (err: unknown) {
      setUploadProgress(false)
      setErrorMsg(err instanceof Error ? err.message : 'บันทึกข้อมูลไม่สำเร็จ')
      setPageState('error')
    }
  }

  const inputBaseCls =
    'px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] transition-all bg-white'
  const inputCls = `w-full ${inputBaseCls}`
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const errorCls = 'text-xs text-red-500 mt-1'

  // ── Loading ────────────────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#f73727] border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-gray-400 text-sm">กำลังโหลด...</p>
      </div>
    )
  }

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (pageState === 'not-logged-in') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <Logo width={160} height={24} />
        <p className="mt-6 text-gray-600 text-sm">กรุณาเข้าสู่ระบบด้วย LINE ก่อน</p>
        <button
          onClick={liffLogin}
          className="mt-4 flex items-center gap-2 px-5 py-3 bg-[#06C755] text-white text-sm font-semibold rounded-xl hover:bg-[#05b04c]"
        >
          <LineIcon />
          เข้าสู่ระบบด้วย LINE
        </button>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <ExclamationCircleIcon className="w-12 h-12 text-red-400" />
        <h2 className="mt-4 text-lg font-bold text-gray-800">เกิดข้อผิดพลาด</h2>
        <p className="mt-2 text-sm text-gray-500">{errorMsg}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl"
        >
          ลองใหม่
        </button>
      </div>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircleIcon className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          {isEdit ? 'อัปเดตข้อมูลสำเร็จ!' : 'ลงทะเบียนสำเร็จ!'}
        </h2>
        <p className="mt-2 text-sm text-gray-500 max-w-xs">
          {isEdit
            ? 'ข้อมูลของคุณถูกอัปเดตเรียบร้อยแล้ว'
            : 'ข้อมูลของคุณถูกบันทึกเรียบร้อยแล้ว สามารถดูงานและเบิกจ่ายได้เลย'}
        </p>
        <button
          onClick={() => router.replace('/freelancer')}
          className="mt-8 w-full max-w-xs py-3.5 bg-[#f73727] text-white font-semibold rounded-2xl hover:bg-red-600 transition-colors"
        >
          ไปหน้าหลัก
        </button>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#f73727] text-white">
        <div className="max-w-lg mx-auto px-4 py-5">
          <Logo white width={120} height={18} href="/freelancer" />
          <h1 className="mt-4 text-xl font-bold">
            {isEdit ? 'แก้ไขข้อมูลส่วนตัว' : 'ลงทะเบียน Freelancer'}
          </h1>
          <p className="text-white/70 text-sm mt-1">
            {isEdit ? 'อัปเดตข้อมูลของคุณ' : 'กรอกข้อมูลเพื่อเริ่มรับงานและเบิกจ่ายเงิน'}
          </p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 pb-12">
        {/* LINE Profile preview */}
        {liffProfile && (
          <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
            {liffProfile.pictureUrl ? (
              <img
                src={liffProfile.pictureUrl}
                alt={liffProfile.displayName}
                className="w-12 h-12 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <UserCircleIcon className="w-12 h-12 text-gray-300 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <LineIcon className="w-4 h-4 text-[#06C755]" />
                <span className="text-xs text-gray-400">เชื่อมต่อกับ LINE แล้ว</span>
              </div>
              <p className="font-semibold text-gray-900 truncate">{liffProfile.displayName}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* ข้อมูลส่วนตัว */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-700">ข้อมูลส่วนตัว</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* คำนำหน้า + ชื่อ */}
              <div className="min-w-0">
                <label className={labelCls}>ชื่อ *</label>
                <div className="flex min-w-0 gap-2">
                  <select
                    {...register('namePrefix', { required: true })}
                    className={`${inputBaseCls} w-28 shrink-0`}
                  >
                    <option value="นาย">นาย</option>
                    <option value="นาง">นาง</option>
                    <option value="นางสาว">นางสาว</option>
                  </select>
                  <input
                    {...register('firstName', { required: 'กรุณากรอกชื่อ' })}
                    className={`${inputBaseCls} min-w-0 flex-1`}
                    placeholder="ชื่อ"
                  />
                </div>
                {errors.firstName && <p className={errorCls}>{errors.firstName.message}</p>}
              </div>

              <div className="min-w-0">
                <label className={labelCls}>นามสกุล *</label>
                <input
                  {...register('lastName', { required: 'กรุณากรอกนามสกุล' })}
                  className={inputCls}
                  placeholder="นามสกุล"
                />
                {errors.lastName && <p className={errorCls}>{errors.lastName.message}</p>}
              </div>

              <div>
                <label className={labelCls}>เบอร์โทรศัพท์ *</label>
                <input
                  {...register('phone', {
                    required: 'กรุณากรอกเบอร์โทร',
                    pattern: { value: /^[0-9]{9,10}$/, message: 'เบอร์โทรไม่ถูกต้อง' },
                  })}
                  className={inputCls}
                  placeholder="0812345678"
                  type="tel"
                  inputMode="tel"
                />
                {errors.phone && <p className={errorCls}>{errors.phone.message}</p>}
              </div>

              <div>
                <label className={labelCls}>อีเมล</label>
                <input
                  {...register('email', {
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'อีเมลไม่ถูกต้อง' },
                  })}
                  className={inputCls}
                  placeholder="email@example.com"
                  type="email"
                  inputMode="email"
                />
                {errors.email && <p className={errorCls}>{errors.email.message}</p>}
              </div>
            </div>
          </div>

          {/* บัญชีธนาคาร */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-700">บัญชีธนาคาร</p>
              <p className="text-xs text-gray-400 mt-0.5">ใช้สำหรับโอนค่าจ้าง กรอกให้ถูกต้อง</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>ธนาคาร *</label>
                <select {...register('bankName', { required: 'กรุณาเลือกธนาคาร' })} className={inputCls}>
                  <option value="">-- เลือกธนาคาร --</option>
                  {bankOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                {errors.bankName && <p className={errorCls}>{errors.bankName.message}</p>}
              </div>

              <div>
                <label className={labelCls}>เลขบัญชีธนาคาร *</label>
                <input
                  {...register('bankAccount', {
                    required: 'กรุณากรอกเลขที่บัญชี',
                    pattern: { value: /^[0-9\-]{10,}$/, message: 'เลขบัญชีไม่ถูกต้อง' },
                  })}
                  className={`${inputCls} font-mono tracking-wider`}
                  placeholder="000-0-00000-0"
                  inputMode="numeric"
                />
                {errors.bankAccount && <p className={errorCls}>{errors.bankAccount.message}</p>}
              </div>
            </div>
          </div>

          {/* สำเนาบัตรประชาชน */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <IdentificationIcon className="w-4 h-4 text-gray-500" />
                สำเนาบัตรประชาชน {!isEdit && <span className="text-red-500">*</span>}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                อัพโหลดภาพถ่ายหรือสแกนบัตรประชาชน · รองรับ JPG, PNG, WEBP, HEIC · ไม่เกิน 10 MB
              </p>
            </div>

            {/* Preview */}
            {idCardPreview && (
              <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={idCardPreview}
                  alt="สำเนาบัตรประชาชน"
                  className="w-full object-contain max-h-56"
                />
                {/* badge รูปเดิม */}
                {!idCardFile && existingIdCardUrl && (
                  <div className="absolute top-2 left-2 bg-green-500/90 text-white text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircleIcon className="w-3 h-3" />
                    อัพโหลดแล้ว
                  </div>
                )}
                {/* ปุ่มลบ */}
                {idCardFile && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-red-500 p-1.5 rounded-lg shadow-sm border border-gray-200 hover:bg-white transition-colors"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* ปุ่มถ่ายรูป / เลือกจากคลัง */}
            <div className={`grid gap-3 ${idCardPreview ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {/* ถ่ายรูปด้วยกล้อง */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#f73727]/40 hover:bg-red-50/30 transition-colors group"
              >
                <CameraIcon className="w-5 h-5 text-gray-400 group-hover:text-[#f73727]/60 transition-colors" />
                <span className="text-sm font-medium text-gray-600 group-hover:text-gray-800">
                  {idCardPreview ? 'ถ่ายใหม่' : 'ถ่ายรูป'}
                </span>
              </button>

              {/* เลือกจากคลังรูป */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#f73727]/40 hover:bg-red-50/30 transition-colors group"
              >
                <PhotoIcon className="w-5 h-5 text-gray-400 group-hover:text-[#f73727]/60 transition-colors" />
                <span className="text-sm font-medium text-gray-600 group-hover:text-gray-800">
                  {idCardPreview ? 'เลือกใหม่' : 'เลือกจากคลัง'}
                </span>
              </button>
            </div>

            {/* hidden input — gallery */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* hidden input — camera (capture="environment" = กล้องหลัง) */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />

            {idCardError && (
              <p className={`${errorCls} flex items-center gap-1`}>
                <ExclamationCircleIcon className="w-3.5 h-3.5 shrink-0" />
                {idCardError}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={pageState === 'saving'}
            className="w-full py-4 bg-[#f73727] text-white font-semibold rounded-2xl hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 shadow-md shadow-red-200 text-base"
          >
            {pageState === 'saving' ? (
              <>
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {uploadProgress ? 'กำลังอัพโหลดรูป...' : 'กำลังบันทึก...'}
              </>
            ) : isEdit ? (
              'บันทึกการเปลี่ยนแปลง'
            ) : (
              'ลงทะเบียน'
            )}
          </button>

          {isEdit && (
            <button
              type="button"
              onClick={() => router.replace('/freelancer')}
              className="w-full py-3 text-gray-500 text-sm hover:text-gray-700 transition-colors"
            >
              ยกเลิก กลับหน้าหลัก
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

function LineIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.630 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  )
}
