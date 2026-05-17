import { FileText, Vote, Clock, TrendingUp, Rocket, Landmark, Shield, AlertTriangle, Flame, Coins, Layers, Percent } from 'lucide-react'
import { useT } from '@/i18n/useT'

const flowSteps = [
  { titleKey: 'guide.flow1Title' as const, descKey: 'guide.flow1Desc' as const, Icon: FileText },
  { titleKey: 'guide.flow2Title' as const, descKey: 'guide.flow2Desc' as const, Icon: Vote },
  { titleKey: 'guide.flow3Title' as const, descKey: 'guide.flow3Desc' as const, Icon: Clock },
  { titleKey: 'guide.flow4Title' as const, descKey: 'guide.flow4Desc' as const, Icon: TrendingUp },
  { titleKey: 'guide.flow5Title' as const, descKey: 'guide.flow5Desc' as const, Icon: Rocket },
  { titleKey: 'guide.flow6Title' as const, descKey: 'guide.flow6Desc' as const, Icon: Landmark },
]

const burnSources = [
  'guide.burnSource1',
  'guide.burnSource2',
  'guide.burnSource3',
  'guide.burnSource4',
] as const

const flywheelSteps = [
  'guide.flywheel1',
  'guide.flywheel2',
  'guide.flywheel3',
  'guide.flywheel4',
  'guide.flywheel5',
  'guide.flywheel6',
] as const

export default function HowToPlay() {
  const t = useT()

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <div className="text-center">
        <h1 className="text-3xl lg:text-4xl font-display font-extrabold gold-text mb-2">
          {t('guide.title')}
        </h1>
        <p className="text-gray-400 text-lg">{t('guide.subtitle')}</p>
      </div>

      <section>
        <div className="card-dark gold-border p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-doge-gold/10 border border-doge-gold/30 flex items-center justify-center">
              <Flame className="w-5 h-5 text-doge-gold" />
            </div>
            <h2 className="text-xl font-display font-bold text-doge-gold">{t('guide.overview')}</h2>
          </div>
          <p className="text-gray-300 leading-relaxed">{t('guide.overviewDesc')}</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-display font-bold mb-8 flex items-center gap-2">
          <Rocket className="w-6 h-6 text-doge-gold" />
          {t('guide.flow')}
        </h2>
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-doge-gold/50 via-doge-gold/20 to-transparent" />
          <div className="space-y-6">
            {flowSteps.map((step, i) => (
              <div key={step.titleKey} className="relative flex gap-5">
                <div className="relative z-10 flex-shrink-0 w-12 h-12 rounded-full bg-dark-800 border-2 border-doge-gold/40 flex items-center justify-center shadow-gold">
                  <span className="font-display font-extrabold text-doge-gold text-lg">{i + 1}</span>
                </div>
                <div className="card-dark flex-1 p-5">
                  <div className="flex items-center gap-2.5 mb-2">
                    <step.Icon className="w-5 h-5 text-doge-gold" />
                    <h3 className="font-display font-bold text-white">{t(step.titleKey)}</h3>
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed">{t(step.descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
          <Vote className="w-6 h-6 text-doge-gold" />
          {t('guide.daoTitle')}
        </h2>
        <div className="space-y-4">
          <div className="card-dark p-5">
            <h3 className="font-display font-bold text-white mb-3">{t('guide.daoWeight')}</h3>
            <div className="bg-dark-950 border border-dark-500/50 rounded-lg p-4 font-mono text-doge-gold text-center text-lg tracking-wide">
              {t('guide.daoWeightFormula')}
            </div>
            <div className="mt-3 bg-dark-700/50 rounded-lg p-3 text-sm text-gray-300">
              <span className="text-doge-cyan font-medium">💡 {t('guide.daoWeightExample')}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card-dark p-5">
              <div className="flex items-center gap-2.5 mb-2">
                <Coins className="w-5 h-5 text-doge-gold" />
                <h3 className="font-display font-bold text-white">{t('guide.daoFair')}</h3>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">{t('guide.daoFairDesc')}</p>
            </div>
            <div className="card-dark p-5">
              <div className="flex items-center gap-2.5 mb-2">
                <Shield className="w-5 h-5 text-doge-cyan" />
                <h3 className="font-display font-bold text-white">{t('guide.daoRefund')}</h3>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">{t('guide.daoRefundDesc')}</p>
            </div>
          </div>

          <div className="card-dark p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <Clock className="w-5 h-5 text-doge-gold" />
              <h3 className="font-display font-bold text-white">{t('guide.daoTimeline')}</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">{t('guide.daoTimelineDetail')}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
          <Landmark className="w-6 h-6 text-doge-gold" />
          {t('guide.lendTitle')}
        </h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card-dark p-5 border-t-2 border-t-doge-gold/40">
              <div className="flex items-center gap-2.5 mb-2">
                <TrendingUp className="w-5 h-5 text-doge-gold" />
                <h3 className="font-display font-bold text-doge-gold">{t('guide.longPool')}</h3>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">{t('guide.longPoolDesc')}</p>
            </div>
            <div className="card-dark p-5 border-t-2 border-t-doge-ember/40">
              <div className="flex items-center gap-2.5 mb-2">
                <AlertTriangle className="w-5 h-5 text-doge-ember" />
                <h3 className="font-display font-bold text-doge-ember">{t('guide.shortPool')}</h3>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">{t('guide.shortPoolDesc')}</p>
            </div>
          </div>

          <div className="card-dark p-5 border border-doge-ember/30 bg-doge-ember/5">
            <div className="flex items-center gap-2.5 mb-2">
              <AlertTriangle className="w-5 h-5 text-doge-ember" />
              <h3 className="font-display font-bold text-doge-ember">{t('guide.liquidation')}</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">{t('guide.liquidationDesc')}</p>
          </div>

          <div className="card-dark p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <Percent className="w-5 h-5 text-doge-cyan" />
              <h3 className="font-display font-bold text-white">{t('guide.dynamicRate')}</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">{t('guide.dynamicRateDesc')}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
          <Flame className="w-6 h-6 text-doge-gold" />
          {t('guide.burnTitle')}
        </h2>
        <div className="space-y-4">
          <div className="card-dark p-5">
            <p className="text-gray-300 leading-relaxed mb-4">{t('guide.burnDesc')}</p>
            <h3 className="font-display font-bold text-white mb-3">{t('guide.burnSources')}</h3>
            <div className="space-y-2">
              {burnSources.map((key, i) => (
                <div key={key} className="flex items-start gap-3 bg-dark-700/50 rounded-lg p-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-doge-gold/10 border border-doge-gold/20 flex items-center justify-center text-xs font-bold text-doge-gold">
                    {i + 1}
                  </span>
                  <span className="text-gray-300 text-sm">{t(key)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card-dark p-5 gold-border">
            <h3 className="font-display font-bold text-doge-gold mb-4">{t('guide.burnFlywheel')}</h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">{t('guide.burnFlywheelDesc')}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {flywheelSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="bg-dark-700 border border-doge-gold/20 rounded-lg px-3 py-1.5 text-sm text-doge-gold font-medium">
                    {t(step)}
                  </span>
                  {i < flywheelSteps.length - 1 && (
                    <span className="text-doge-gold/60 text-lg">→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
          <Layers className="w-6 h-6 text-doge-gold" />
          {t('guide.creatorTitle')}
        </h2>
        <p className="text-gray-400 mb-4">{t('guide.creatorDesc')}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="card-dark p-5 text-center">
            <Coins className="w-8 h-8 text-doge-gold mx-auto mb-3" />
            <h3 className="font-display font-bold text-white mb-2">{t('guide.creatorTax')}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{t('guide.creatorTaxDesc')}</p>
          </div>
          <div className="card-dark p-5 text-center">
            <Layers className="w-8 h-8 text-doge-cyan mx-auto mb-3" />
            <h3 className="font-display font-bold text-white mb-2">{t('guide.creatorLp')}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{t('guide.creatorLpDesc')}</p>
          </div>
          <div className="card-dark p-5 text-center">
            <Flame className="w-8 h-8 text-doge-violet mx-auto mb-3" />
            <h3 className="font-display font-bold text-white mb-2">{t('guide.creatorToken')}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{t('guide.creatorTokenDesc')}</p>
          </div>
        </div>
        <div className="card-dark overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-dark-700/50">
                <th className="text-left px-4 py-3 font-display font-bold text-gray-300">{t('guide.tableOption')}</th>
                <th className="text-center px-4 py-3 font-display font-bold text-doge-gold">{t('guide.tableTaxShare')}</th>
                <th className="text-center px-4 py-3 font-display font-bold text-doge-cyan">{t('guide.tableLpShare')}</th>
                <th className="text-center px-4 py-3 font-display font-bold text-doge-violet">{t('guide.tableTokenAlloc')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-dark-500/20">
                <td className="px-4 py-3 font-medium text-white">{t('guide.option1')}</td>
                <td className="px-4 py-3 text-center text-doge-gold font-display font-bold">50%</td>
                <td className="px-4 py-3 text-center text-doge-cyan font-display font-bold">10%</td>
                <td className="px-4 py-3 text-center text-doge-violet font-display font-bold">5%</td>
              </tr>
              <tr className="border-t border-dark-500/20">
                <td className="px-4 py-3 font-medium text-white">{t('guide.option2')}</td>
                <td className="px-4 py-3 text-center text-doge-gold font-display font-bold">22.5%</td>
                <td className="px-4 py-3 text-center text-doge-cyan font-display font-bold">4.5%</td>
                <td className="px-4 py-3 text-center text-doge-violet font-display font-bold">2.25%</td>
              </tr>
              <tr className="border-t border-dark-500/20">
                <td className="px-4 py-3 font-medium text-white">{t('guide.option3')}</td>
                <td className="px-4 py-3 text-center text-doge-gold font-display font-bold">14%</td>
                <td className="px-4 py-3 text-center text-doge-cyan font-display font-bold">2.8%</td>
                <td className="px-4 py-3 text-center text-doge-violet font-display font-bold">1.4%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
          <Coins className="w-6 h-6 text-doge-gold" />
          {t('guide.fairTitle')}
        </h2>
        <div className="card-dark p-6 gold-border mb-4">
          <p className="text-gray-300 leading-relaxed">{t('guide.fairDesc')}</p>
        </div>
        <div className="space-y-3">
          <div className="card-dark p-4 flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-doge-gold/10 border border-doge-gold/30 flex items-center justify-center">
              <Vote className="w-5 h-5 text-doge-gold" />
            </div>
            <div>
              <p className="text-white font-medium">{t('guide.fairBenefit1')}</p>
            </div>
          </div>
          <div className="card-dark p-4 flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-doge-cyan/10 border border-doge-cyan/30 flex items-center justify-center">
              <Coins className="w-5 h-5 text-doge-cyan" />
            </div>
            <div>
              <p className="text-white font-medium">{t('guide.fairBenefit2')}</p>
            </div>
          </div>
          <div className="card-dark p-4 flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-doge-ember/10 border border-doge-ember/30 flex items-center justify-center">
              <Flame className="w-5 h-5 text-doge-ember" />
            </div>
            <div>
              <p className="text-white font-medium">{t('guide.fairBenefit3')}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
