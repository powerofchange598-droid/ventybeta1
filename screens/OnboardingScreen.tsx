import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import VentyButton from '../components/VentyButton';
import { UserPlusIcon, UsersIcon, KeyIcon, EyeIcon, LockClosedIcon, EyeSlashIcon, UserIcon, FingerPrintIcon, CheckCircleIcon, InformationCircleIcon, ArrowRightIcon, ArrowLeftIcon } from '@heroicons/react/24/solid';
import { HomeIcon, TruckIcon, ShoppingCartIcon, TvIcon, HeartIcon, BuildingStorefrontIcon, AcademicCapIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { mockFamily } from '../data/mockData';
import Card from '../components/Card';
import { TOP_100_COUNTRIES } from '../data/TOP_100_COUNTRIES';
import { COUNTRY_CURRENCY, AVAILABLE_CURRENCIES } from '../data/currencyData';
import { useDetectCountry } from '../hooks/useDetectCountry';
import Copyright from '../components/Copyright';
import { useTranslation } from 'react-i18next';
import { GoogleIcon, FacebookIcon, AppleIcon } from '../components/Icons';
import { useAuth } from '../hooks/useAuth';
import SelectorModal from '../components/SelectorModal';
import PasswordStrengthMeter, { checkPasswordStrength } from '../components/PasswordStrengthMeter';
import { useLocalization } from '../hooks/useLocalization';
import { AVAILABLE_LANGUAGES } from '../data/LangTop100';

interface OnboardingData {
    name: string;
    email: string;
    salary: number;
    familyMembers: number;
    currency: string;
    country: string;
    countryCode: string;
    password: string;
    accountPlan: 'single' | 'family';
    primarySpendingCategory: string;
}

interface OnboardingScreenProps {
    onComplete: (user: OnboardingData) => void;
    onJoinFamily: () => void;
    onExploreAsGuest: () => void;
}

const Spinner = () => <svg className="animate-spin h-5 w-5 text-text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>;

const SocialButton: React.FC<{
    icon: React.ReactNode;
    text: string;
    onClick: () => void;
    isLoading?: boolean;
    isSuccess?: boolean;
    disabled?: boolean;
}> = ({ icon, text, onClick, isLoading = false, isSuccess = false, disabled = false }) => {
    let content;
    if (isLoading) {
        content = <Spinner />;
    } else if (isSuccess) {
        content = <CheckCircleIcon className="h-5 w-5 text-feedback-success" />;
    } else {
        content = icon;
    }

    const successClasses = isSuccess ? '!bg-feedback-success/20 !border-feedback-success/50' : '';

    return (
        <VentyButton
            onClick={onClick}
            disabled={disabled || isLoading || isSuccess}
            variant="outline"
            className={`w-full flex items-center justify-center space-x-2 !py-3 px-4 !text-black !border-black/20 ${successClasses}`}
        >
            {content}
            <span className="font-semibold">{text}</span>
        </VentyButton>
    );
};

const ProgressBar: React.FC<{ current: number; total: number }> = ({ current, total }) => (
    <div className="w-full bg-bg-tertiary rounded-full h-2 my-4">
        <motion.div
            className="bg-brand-primary h-2 rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: `${(current / total) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
        />
    </div>
);

const PersonalOnboardingForm: React.FC<{ onNext: (data: Omit<OnboardingData, 'accountPlan' | 'primarySpendingCategory'>) => void; accountPlan: 'single' | 'family'; initialData?: { name: string; email: string } | null }> = ({ onNext, accountPlan, initialData }) => {
    const { t } = useTranslation();
    const isSocialSignup = !!initialData;
    const [name, setName] = useState(initialData?.name || '');
    const [email, setEmail] = useState(initialData?.email || '');
    const [salary, setSalary] = useState('');
    const [familyMembers, setFamilyMembers] = useState('');
    const { detectedCode, isLoading } = useDetectCountry();
    const [countryCode, setCountryCode] = useState('');
    const [countrySelectOpen, setCountrySelectOpen] = useState(false);
    const [currency, setCurrency] = useState('USD');
    const [currencySelectOpen, setCurrencySelectOpen] = useState(false);
    const { setCurrency: setGlobalCurrency } = useLocalization();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordStrength, setPasswordStrength] = useState({ score: 0 });

    const [showHouseholdForSingle, setShowHouseholdForSingle] = useState(false);
    const [tooltipVisible, setTooltipVisible] = useState(false);

    useEffect(() => {
        setPasswordStrength(checkPasswordStrength(password));
    }, [password]);

    useEffect(() => {
        if (!isLoading && detectedCode) {
            const currencyInfo = COUNTRY_CURRENCY[detectedCode];
            setCountryCode(detectedCode);
            if (currencyInfo) {
                setCurrency(currencyInfo.code);
            }
        }
    }, [isLoading, detectedCode]);

    const countryItems = TOP_100_COUNTRIES.map(c => ({ key: c.code, label: `${c.flag} ${c.en}` }));
    const handleCountryChange = (val: string) => {
        setCountryCode(val);
        const info = COUNTRY_CURRENCY[val];
        if (info) {
            setCurrency(info.code);
            setGlobalCurrency(info.code);
        }
        setCountrySelectOpen(false);
    };
    const currencyItems = AVAILABLE_CURRENCIES.map(cur => ({ key: cur.code, label: `${cur.nameEn} (${cur.code})` }));
    const handleCurrencyChange = (val: string) => {
        setCurrency(val);
        setGlobalCurrency(val);
        setCurrencySelectOpen(false);
    };

    const { signUpWithEmail } = useAuth();
    const handleFinish = async () => {
        if (passwordStrength.score < 3) {
            setPasswordError("Password is too weak. Please choose a stronger one.");
            return;
        }
        if (password !== confirmPassword) {
            setPasswordError("Passwords do not match.");
            return;
        }
        setPasswordError('');

        const selectedCountry = TOP_100_COUNTRIES.find(c => c.code === countryCode);
        if (!selectedCountry) return;
        const nextData = {
            name,
            email,
            salary: Number(salary),
            familyMembers: Number(familyMembers) || 1, // Default to 1 if empty
            currency,
            country: selectedCountry.en,
            countryCode,
            password,
        };
        // Sign up with email if not a social signup
        if (!isSocialSignup) {
            const created = await signUpWithEmail(email, password);
            if (!created) {
                alert('Sign up failed. Please check your email format and try again.');
                return;
            }
        }
        try {
            const backend = (import.meta as any).env?.VITE_PAYPAL_BACKEND_URL || `${window.location.protocol}//${window.location.hostname}:8080`;
            const userId = email || 'anon';
            await fetch(`${backend}/api/users/${encodeURIComponent(userId)}/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ country: nextData.country, countryCode: nextData.countryCode, currency: nextData.currency })
            });
        } catch {}
        onNext(nextData);
    };
    
    const isFormValid = name && email && salary && countryCode && password && confirmPassword && passwordStrength.score >= 3 && (accountPlan === 'family' ? !!familyMembers && Number(familyMembers) > 1 : true);

    const tooltipText = accountPlan === 'single'
        ? "For single accounts, this number helps us tailor your budget suggestions (e.g., for groceries). It does not create a multi-user account."
        : "For family accounts, this sets the number of members you can invite and manage. This will be used to set up your family dashboard.";
    
    const householdSizeLabel = accountPlan === 'single'
        ? "How many people are in your household (including you)?"
        : t('onboarding.householdLabel');

    const householdField = (
        <div className="relative">
            <label className="font-medium flex items-center space-x-1">
                <span>{householdSizeLabel}</span>
                <div onMouseEnter={() => setTooltipVisible(true)} onMouseLeave={() => setTooltipVisible(false)}>
                    <InformationCircleIcon className="h-4 w-4 text-text-secondary cursor-pointer" />
                </div>
            </label>
            {tooltipVisible && (
                <div className="absolute bottom-full mb-2 w-64 bg-text-primary text-white text-xs rounded-lg p-2 z-10 shadow-lg">
                    {tooltipText}
                </div>
            )}
            <input 
                type="number" 
                value={familyMembers} 
                onChange={e => setFamilyMembers(e.target.value)} 
                placeholder="e.g., 4" 
                required={accountPlan === 'family'}
                min={accountPlan === 'family' ? 2 : 1}
                className="w-full mt-1"
            />
        </div>
    );

    return (
        <div>
            <h2 className="text-3xl font-bold text-center mb-6 text-text-primary">{t('onboarding.personalFormTitle')}</h2>
            <div className="space-y-6">
                <div>
                    <label className="font-medium text-text-primary">{t('onboarding.nameLabel')}</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('onboarding.namePlaceholder')} readOnly={isSocialSignup} className={`w-full mt-1 ${isSocialSignup ? 'cursor-not-allowed bg-bg-tertiary' : ''}`}/>
                </div>
                <div>
                    <label className="font-medium text-text-primary">Email Address</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g., mohamed@example.com" readOnly={isSocialSignup} className={`w-full mt-1 ${isSocialSignup ? 'cursor-not-allowed bg-bg-tertiary' : ''}`}/>
                </div>
                <div>
                    <label className="font-medium text-text-primary">{t('onboarding.countryLabel')}</label>
                    <button type="button" onClick={() => setCountrySelectOpen(true)} className="w-full mt-1 p-3 bg-bg-tertiary text-text-secondary rounded-lg border border-bg-tertiary flex items-center justify-between">
                        {isLoading ? (
                            <Spinner />
                        ) : (
                            <span className="text-lg">
                                {TOP_100_COUNTRIES.find(c => c.code === countryCode)?.flag}{' '}
                                {TOP_100_COUNTRIES.find(c => c.code === countryCode)?.en || 'Select Country'}
                            </span>
                        )}
                        <ArrowRightIcon className="w-4 h-4" />
                    </button>
                </div>
                <div>
                    <label className="font-medium text-text-primary">{t('onboarding.incomeLabel', { currency })}</label>
                    <div className="flex mt-1">
                        <input type="number" value={salary} onChange={e => setSalary(e.target.value)} placeholder={t('onboarding.incomePlaceholder')} className="w-full"/>
                    </div>
                    <div className="mt-2">
                        <button type="button" onClick={() => setCurrencySelectOpen(true)} className="cta-text-link !text-sm w-full justify-start">
                            Change currency (currently {currency})
                        </button>
                    </div>
                </div>
                
                {accountPlan === 'family' ? (
                    householdField
                ) : (
                    <>
                        {!showHouseholdForSingle ? (
                            <button onClick={() => setShowHouseholdForSingle(true)} className="cta-text-link !text-sm w-full justify-start">
                                Budgeting for more than one person? (Optional)
                            </button>
                        ) : (
                            <div>
                                {householdField}
                            </div>
                        )}
                    </>
                )}

                <hr className="border-bg-tertiary" />
                <h3 className="font-semibold text-center text-text-secondary">Create a Secure Password</h3>
                <div>
                    <label className="font-medium text-text-primary">Password</label>
                    <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter a secure password" required className="w-full mt-1 pr-10"/>
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
                           {showPassword ? <EyeSlashIcon className="h-5 w-5 text-text-tertiary" /> : <EyeIcon className="h-5 w-5 text-text-tertiary" />}
                        </button>
                    </div>
                    <PasswordStrengthMeter score={passwordStrength.score} />
                    <p className="text-xs text-text-secondary mt-1">Use at least 8 characters with a mix of letters, numbers, and symbols.</p>
                </div>
                 <div>
                    <label className="font-medium text-text-primary">Confirm Password</label>
                    <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm your password" required className="w-full mt-1 pr-10"/>
                         <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
                           {showPassword ? <EyeSlashIcon className="h-5 w-5 text-text-tertiary" /> : <EyeIcon className="h-5 w-5 text-text-tertiary" />}
                        </button>
                    </div>
                </div>
                 {passwordError && <p className="text-feedback-error text-sm text-center">{passwordError}</p>}
            </div>
            <div className="mt-8">
                <VentyButton onClick={handleFinish} disabled={!isFormValid} variant="primary">
                    {t('buttons.continue')} <ArrowRightIcon className="w-4 h-4 ml-2" />
                </VentyButton>
            </div>
            <SelectorModal isOpen={countrySelectOpen} onClose={() => setCountrySelectOpen(false)} title={t('onboarding.selectCountryTitle')} items={countryItems} initialSelectedKey={countryCode} onSelect={handleCountryChange} placeholder={t('settings.searchCountries') || 'Search countries'} />
            <SelectorModal isOpen={currencySelectOpen} onClose={() => setCurrencySelectOpen(false)} title="Select Currency" items={currencyItems} initialSelectedKey={currency} onSelect={handleCurrencyChange} placeholder="Search currencies" />
        </div>
    );
};

const JoinFamilyForm: React.FC<{ onJoin: () => void }> = ({ onJoin }) => {
    const { t } = useTranslation();
    const [familyCode, setFamilyCode] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    const handleJoin = () => {
        if (familyCode.trim().toUpperCase() !== mockFamily.familyCode.toUpperCase()) {
            setError(t('onboarding.errorInvalidCode'));
            return;
        }
        if (password !== mockFamily.password) {
            setError('Incorrect family password. Please try again.');
            return;
        }
        onJoin();
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-center mb-4 text-text-primary">{t('onboarding.joinFormTitle')}</h2>
            <p className="text-center text-text-secondary mb-6">{t('onboarding.joinFormSubtitle')}</p>
            <div className="space-y-6">
                <div className="relative">
                    <KeyIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-tertiary"/>
                    <input 
                        type="text" 
                        value={familyCode} 
                        onChange={e => { setFamilyCode(e.target.value); setError(''); }}
                        placeholder={t('onboarding.joinCodePlaceholder')} 
                        className="w-full pl-12"
                    />
                </div>
                <div className="relative">
                    <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-tertiary"/>
                    <input 
                        type={showPassword ? 'text' : 'password'}
                        value={password} 
                        onChange={e => { setPassword(e.target.value); setError(''); }}
                        placeholder="Family Password" 
                        className="w-full pl-12 pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
                        {showPassword ? <EyeSlashIcon className="h-5 w-5 text-text-tertiary" /> : <EyeIcon className="h-5 w-5 text-text-tertiary" />}
                    </button>
                </div>
                 <div className="text-right -mt-2">
                    <button onClick={() => alert('A password reset link would be sent to the family head\'s email.')} className="cta-text-link !text-sm">
                        Forgot Family Password?
                    </button>
                </div>
            </div>
            {error && <p className="text-feedback-error text-sm text-center mt-2">{error}</p>}
            <div className="mt-6">
                <VentyButton onClick={handleJoin} disabled={!familyCode.trim() || !password.trim()} label={t('buttons.joinFamily')} variant="primary"></VentyButton>
            </div>
        </div>
    );
};

const LoginEmailForm: React.FC<{ onLoggedIn: (email: string) => void }> = ({ onLoggedIn }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const { signInWithEmail } = useAuth();
    const { currency, setCurrency: setGlobalCurrency } = useLocalization();
    const [currencySelectOpen, setCurrencySelectOpen] = useState(false);
    const currencyItems = AVAILABLE_CURRENCIES.map(cur => ({ key: cur.code, label: `${cur.nameEn} (${cur.code})` }));
    const handleCurrencyChange = (val: string) => {
        setGlobalCurrency(val);
        setCurrencySelectOpen(false);
    };

    const handleLogin = async () => {
        setError('');
        const user = await signInWithEmail(email, password);
        if (user) {
            onLoggedIn(email);
        } else {
            setError('Login failed. Check your credentials and try again.');
        }
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-center mb-4 text-text-primary">Log in with Email</h2>
            <div className="space-y-6">
                <div>
                    <label className="font-medium text-text-primary">Email Address</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g., mohamed@example.com" className="w-full mt-1"/>
                </div>
                <div>
                    <label className="font-medium text-text-primary">Password</label>
                    <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required className="w-full mt-1 pr-10"/>
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
                           {showPassword ? <EyeSlashIcon className="h-5 w-5 text-text-tertiary" /> : <EyeIcon className="h-5 w-5 text-text-tertiary" />}
                        </button>
                    </div>
                </div>
                <div>
                    <label className="font-medium text-text-primary">Preferred Currency</label>
                    <button type="button" onClick={() => setCurrencySelectOpen(true)} className="w-full mt-1 p-3 bg-bg-tertiary text-text-secondary rounded-lg border border-bg-tertiary flex items-center justify-between">
                        <span className="text-lg">{currency}</span>
                        <ArrowRightIcon className="w-4 h-4" />
                    </button>
                </div>
                {error && <p className="text-feedback-error text-sm text-center">{error}</p>}
            </div>
            <div className="mt-6">
                <VentyButton onClick={handleLogin} disabled={!email || !password} label="Log in" variant="primary"></VentyButton>
            </div>
            <SelectorModal isOpen={currencySelectOpen} onClose={() => setCurrencySelectOpen(false)} title="Select Currency" items={currencyItems} initialSelectedKey={currency} onSelect={handleCurrencyChange} placeholder="Search currencies" />
        </div>
    );
};

const AccountTypeSelection: React.FC<{ onSelect: (type: 'single' | 'family') => void }> = ({ onSelect }) => (
    <div>
        <h2 className="text-3xl font-bold text-center mb-4 text-text-primary">How will you use Venty?</h2>
        <p className="text-center text-text-secondary mb-8">Choose an account type. This will tailor your experience.</p>
        <div className="space-y-6">
            <Card onClick={() => onSelect('single')} className="!p-6 text-left hover:border-text-primary border-2">
                <div className="flex items-center space-x-4">
                    <UserIcon className="h-10 w-10 text-text-primary" />
                    <div>
                        <h3 className="font-bold text-lg text-text-primary">Single Account</h3>
                        <p className="text-text-secondary">For individual use. Manage your personal finances and budget.</p>
                    </div>
                </div>
            </Card>
            <Card onClick={() => onSelect('family')} className="!p-6 text-left hover:border-text-primary border-2">
                <div className="flex items-center space-x-4">
                    <UsersIcon className="h-10 w-10 text-text-primary" />
                    <div>
                        <h3 className="font-bold text-lg text-text-primary">Family Account</h3>
                        <p className="text-text-secondary">Invite and manage family members, with shared budgets and goals.</p>
                    </div>
                </div>
            </Card>
        </div>
    </div>
);

const spendingOptions: { id: string; label: string; icon: React.ElementType }[] = [
    { id: 'housing', label: 'Housing', icon: HomeIcon },
    { id: 'food', label: 'Food', icon: ShoppingCartIcon },
    { id: 'transport', label: 'Transport', icon: TruckIcon },
    { id: 'entertainment', label: 'Entertainment', icon: TvIcon },
    { id: 'subscriptions', label: 'Subscriptions', icon: TvIcon },
    { id: 'health', label: 'Health', icon: HeartIcon },
    { id: 'shopping', label: 'Shopping', icon: BuildingStorefrontIcon },
    { id: 'education', label: 'Education', icon: AcademicCapIcon },
    { id: 'other', label: 'Other', icon: BanknotesIcon },
];

const LifestyleQuizStep: React.FC<{ onNext: (category: string) => void }> = ({ onNext }) => {
    const [selectedCategory, setSelectedCategory] = useState('');

    return (
        <div className="w-full text-center">
            <h2 className="text-lg text-text-secondary">To personalize your insights, tell us — <strong className="text-2xl block text-text-primary mt-1">Which category takes the biggest share of your monthly budget?</strong></h2>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 mt-8">
                {spendingOptions.map(opt => (
                    <div
                        key={opt.id}
                        onClick={() => onNext(opt.label)}
                        className={`p-4 rounded-2xl flex flex-col items-center justify-center cursor-pointer aspect-square transition-all duration-200 bg-bg-secondary border-2 border-transparent hover:border-brand-primary`}
                    >
                        <opt.icon className={`h-8 w-8 sm:h-10 sm:h-10 transition-colors text-text-secondary`} />
                        <p className="font-semibold text-sm mt-2 text-center text-text-primary">{opt.label}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

const TermsView: React.FC<{ onAccept: () => void }> = ({ onAccept }) => {
    const { t } = useTranslation();
    const [accepted, setAccepted] = useState(false);

    return (
        <div>
            <h2 className="text-3xl font-bold text-center mb-4 text-text-primary">{t('onboarding.terms.title')}</h2>
            <div className="h-64 overflow-y-auto p-4 bg-bg-primary rounded-lg border border-bg-tertiary text-text-secondary mb-4">
                <p>Please review our legal documents before proceeding.</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><Link to="/terms" target="_blank" className="text-text-primary hover:underline">Terms & Conditions</Link></li>
                    <li><Link to="/privacy" target="_blank" className="text-text-primary hover:underline">Privacy Policy</Link></li>
                </ul>
            </div>
            <div className="flex items-center space-x-3">
                <input type="checkbox" id="terms-check" checked={accepted} onChange={() => setAccepted(!accepted)} className="h-5 w-5"/>
                <label htmlFor="terms-check" className="text-text-body">
                    {t('onboarding.terms.checkboxLabel')}{' '}
                    <Link to="/terms" target="_blank" className="text-text-primary hover:underline">Terms & Conditions</Link> and{' '}
                    <Link to="/privacy" target="_blank" className="text-text-primary hover:underline">{t('onboarding.terms.privacyPolicyLink')}</Link>.
                </label>
            </div>
            <div className="mt-8">
                <VentyButton onClick={onAccept} disabled={!accepted} label="Finish Setup" variant="primary"></VentyButton>
            </div>
        </div>
    );
};

const BiometricsStep: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
    const [status, setStatus] = useState<'idle' | 'enabling' | 'success'>('idle');

    const handleEnable = () => {
        setStatus('enabling');
        setTimeout(() => {
            setStatus('success');
            setTimeout(() => onComplete(), 1000);
        }, 1500);
    };
    
    return (
        <div className="text-center">
            {status === 'success' ? (
                <>
                    <CheckCircleIcon className="h-24 w-24 text-feedback-success mx-auto mb-4" />
                    <h2 className="text-3xl font-bold text-text-primary">Biometrics Enabled!</h2>
                    <p className="text-text-secondary mt-2">You can now log in faster and more securely.</p>
                </>
            ) : (
                <>
                    <FingerPrintIcon className={`h-24 w-24 text-text-primary mx-auto mb-4 ${status === 'enabling' ? 'animate-pulse' : ''}`} />
                    <h2 className="text-3xl font-bold text-text-primary">Enable Faster, Secure Login</h2>
                    <p className="text-text-secondary mt-2 max-w-sm mx-auto">Use your fingerprint or Face ID to log in. Your biometric data is stored securely on your device, not in the cloud.</p>
                    <div className="mt-8 space-y-3">
                        <VentyButton onClick={handleEnable} disabled={status === 'enabling'} label={status === 'enabling' ? 'Enabling...' : 'Enable Biometrics'} variant="primary"></VentyButton>
                        <button onClick={onComplete} className="cta-text-link">Maybe Later</button>
                    </div>
                </>
            )}
        </div>
    );
};

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete, onJoinFamily, onExploreAsGuest }) => {
    const { t, i18n } = useTranslation();
    const [view, setView] = useState<'welcome' | 'accountType' | 'lifestyleQuiz' | 'personal' | 'joinFamily' | 'terms' | 'biometrics' | 'loginEmail'>('welcome');
    const [pendingData, setPendingData] = useState<Partial<OnboardingData>>({});
    const [accountPlan, setAccountPlan] = useState<'single' | 'family'>('single');
    const [authState, setAuthState] = useState<{ provider: string | null; isLoading: boolean; isSuccess: boolean }>({ provider: null, isLoading: false, isSuccess: false });
    const [socialData, setSocialData] = useState<{ name: string; email: string } | null>(null);
    const [isBiometricsAvailable, setIsBiometricsAvailable] = useState(false);
    const [langOpen, setLangOpen] = useState(false);

    const containerVariants: any = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 120, staggerChildren: 0.1 } },
        exit: { opacity: 0, y: -20, transition: { duration: 0.2 } }
    };

    useEffect(() => {
        const checkBiometricsSupport = async () => {
            if (window.PublicKeyCredential && 
                typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
                try {
                    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
                    setIsBiometricsAvailable(available);
                } catch (e) {
                    setIsBiometricsAvailable(false);
                }
            }
        };
        checkBiometricsSupport();
    }, []);

    const { signInWithGoogle, signInWithFacebook, signInWithApple } = useAuth();
    const handleSocialLogin = async (provider: 'google' | 'facebook' | 'apple') => {
        setAuthState({ provider, isLoading: true, isSuccess: false });
        try {
            let u = null;
            if (provider === 'google') u = await signInWithGoogle();
            else if (provider === 'facebook') u = await signInWithFacebook();
            else u = await signInWithApple();
            if (u) {
                const data = { name: u.displayName || '', email: u.email || '' };
                setSocialData(data);
                setAuthState({ provider, isLoading: false, isSuccess: true });
                setTimeout(() => {
                    setView('accountType');
                    setAuthState({ provider: null, isLoading: false, isSuccess: false });
                }, 800);
            } else {
                setAuthState({ provider, isLoading: false, isSuccess: false });
                alert('Authentication failed or cancelled. Please try again.');
            }
        } catch {
            setAuthState({ provider, isLoading: false, isSuccess: false });
            alert('Authentication error. Please check your network and try again.');
        }
    };

    const handleAccountTypeSelect = (type: 'single' | 'family') => {
        setAccountPlan(type);
        setPendingData(prev => ({...prev, accountPlan: type}));
        setView('lifestyleQuiz');
    };

    const handleLifestyleQuizNext = (category: string) => {
        setPendingData(prev => ({ ...prev, primarySpendingCategory: category }));
        setView('personal');
    };

    const handlePersonalFormNext = (data: Omit<OnboardingData, 'accountPlan' | 'primarySpendingCategory'>) => {
        setPendingData(prev => ({ ...prev, ...data }));
        setView('terms');
    };
    
    const handleTermsAccept = () => {
        if (isBiometricsAvailable) {
            setView('biometrics');
        } else {
            if (pendingData) {
                onComplete(pendingData as OnboardingData);
            }
        }
    };
    
    const handleBiometricsComplete = () => {
        if (pendingData) {
            onComplete(pendingData as OnboardingData);
        }
    }

    const handleBack = () => {
        if (view === 'biometrics') setView('terms');
        else if (view === 'terms') setView('personal');
        else if (view === 'personal') setView('lifestyleQuiz');
        else if (view === 'lifestyleQuiz') setView('accountType');
        else if (view === 'accountType') {
            setView('welcome');
            setSocialData(null);
            setPendingData({});
        } else if (view === 'joinFamily') {
            setView('welcome');
        }
    };

    const onboardingSteps = ['accountType', 'lifestyleQuiz', 'personal', 'terms', 'biometrics'];
    const currentStepIndex = onboardingSteps.indexOf(view);
    const showProgressBar = currentStepIndex >= 0;
    const progressTotalSteps = isBiometricsAvailable ? onboardingSteps.length : onboardingSteps.length - 1;

    const renderCurrentView = () => {
        switch(view) {
            case 'welcome':
                return (
                     <div className="w-full max-w-md text-center">
                        <div className="flex justify-end mb-2">
                            <button onClick={() => setLangOpen(true)} className="cta-text-link !text-sm">
                                {t('settings.language')}
                            </button>
                        </div>
                        <motion.h1 variants={containerVariants} className="text-4xl font-bold tracking-tight text-text-primary">{t('welcomeBrand')}</motion.h1>
                        <motion.p variants={containerVariants} className="mt-2 text-xl text-text-secondary">Your money. Your way.</motion.p>
                        <motion.div variants={containerVariants} className="mt-10 space-y-4">
                            <SocialButton icon={<GoogleIcon />} text={t('onboarding.continueWithGoogle')} onClick={() => handleSocialLogin('google')} isLoading={authState.provider === 'google' && authState.isLoading} isSuccess={authState.provider === 'google' && authState.isSuccess} disabled={authState.isLoading} />
                            <SocialButton icon={<FacebookIcon />} text={t('onboarding.continueWithFacebook')} onClick={() => handleSocialLogin('facebook')} isLoading={authState.provider === 'facebook' && authState.isLoading} isSuccess={authState.provider === 'facebook' && authState.isSuccess} disabled={authState.isLoading} />
                            <SocialButton icon={<AppleIcon />} text={t('onboarding.continueWithApple')} onClick={() => handleSocialLogin('apple')} isLoading={authState.provider === 'apple' && authState.isLoading} isSuccess={authState.provider === 'apple' && authState.isSuccess} disabled={authState.isLoading} />
                        </motion.div>
                        <motion.div variants={containerVariants} className="flex items-center py-8"><hr className="flex-grow border-bg-tertiary/50" /><span className="px-4 font-semibold text-text-secondary">{t('onboarding.orDivider')}</span><hr className="flex-grow border-bg-tertiary/50" /></motion.div>
                        <motion.div variants={containerVariants} className="space-y-3">
                            <VentyButton onClick={() => { setSocialData(null); setView('accountType'); }} label={t('onboarding.signupWithEmailTitle')} variant="primary"></VentyButton>
                            <VentyButton onClick={() => setView('loginEmail')} label="Log in with Email" variant="outline"></VentyButton>
                        </motion.div>
                        <motion.div variants={containerVariants} className="mt-12 text-center space-y-3 flex flex-col items-center">
                            <button onClick={() => setView('joinFamily')} className="cta-text-link"><UsersIcon className="w-5 h-5 mr-1.5" /><span>{t('onboarding.joinFamilyTitle')}</span></button>
                            <button onClick={onExploreAsGuest} className="cta-text-link"><EyeIcon className="w-5 h-5 mr-1.5" /><span>{t('onboarding.exploreAsGuest')}</span></button>
                        </motion.div>
                    </div>
                );
            case 'accountType': return <AccountTypeSelection onSelect={handleAccountTypeSelect} />;
            case 'lifestyleQuiz': return <LifestyleQuizStep onNext={handleLifestyleQuizNext} />;
            case 'personal': return <PersonalOnboardingForm onNext={handlePersonalFormNext} accountPlan={accountPlan} initialData={socialData} />;
            case 'joinFamily': return <JoinFamilyForm onJoin={onJoinFamily} />;
            case 'loginEmail': return <LoginEmailForm onLoggedIn={(email) => { setSocialData({ name: '', email }); setView('accountType'); }} />;
            case 'terms': return <TermsView onAccept={handleTermsAccept} />;
            case 'biometrics': return <BiometricsStep onComplete={handleBiometricsComplete} />;
            default: return null;
        }
    }

    return (
        <div className="h-full flex flex-col">
            <main className="flex-grow flex flex-col justify-center items-center p-6">
                 {showProgressBar && (
                     <div className="w-full max-w-md mb-8">
                        <p className="text-center font-semibold text-text-secondary mb-2">Step {currentStepIndex + 1} of {progressTotalSteps}</p>
                        <ProgressBar current={currentStepIndex + 1} total={progressTotalSteps} />
                    </div>
                )}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={view}
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="w-full max-w-md"
                    >
                      {renderCurrentView()}
                    </motion.div>
                </AnimatePresence>
                {view !== 'welcome' && (
                    <div className="text-center mt-6">
                        <button onClick={handleBack} className="cta-text-link">
                            <ArrowLeftIcon className="w-4 h-4 mr-1" />
                            {t('onboarding.goBack')}
                        </button>
                    </div>
                )}
            </main>
            <SelectorModal
                isOpen={langOpen}
                title={t('settings.modals.selectLanguage')}
                items={AVAILABLE_LANGUAGES.map(l => ({ key: l.code, label: l.nameEn }))}
                initialSelectedKey={i18n.language || 'en'}
                onClose={() => setLangOpen(false)}
                onSelect={(code) => {
                    i18n.changeLanguage(code);
                    try { localStorage.setItem('ventyLang', code); } catch {}
                }}
                placeholder={t('settings.modals.searchLanguages')}
            />
            <Copyright />
        </div>
    );
};

export default OnboardingScreen;
