import UIKit
import Capacitor

/// One page of the onboarding. Built by the web app (nativeOnboardingSteps in
/// onboarding-content.ts), which keeps the text and decides what to show.
struct OnboardingStepData {
    struct Feature {
        let symbol: String
        let text: String
    }

    let id: String
    let title: String
    let intro: String
    let symbol: String
    /// Shows the app's logo instead of the symbol.
    let logo: Bool
    let features: [Feature]

    static func parse(_ call: CAPPluginCall) -> [OnboardingStepData] {
        (call.getArray("steps", JSObject.self) ?? []).map { step in
            OnboardingStepData(
                id: step["id"] as? String ?? "",
                title: step["title"] as? String ?? "",
                intro: step["intro"] as? String ?? "",
                symbol: step["symbol"] as? String ?? "circle",
                logo: step["logo"] as? Bool ?? false,
                features: ((step["features"] as? JSArray) ?? []).compactMap { $0 as? JSObject }.map {
                    Feature(symbol: $0["symbol"] as? String ?? "circle", text: $0["text"] as? String ?? "")
                })
        }
    }
}

/// The onboarding as a sheet: a page per step, swiped through or stepped with
/// the prominent button. Close, or a swipe down, skips it.
final class OnboardingController: UIViewController, UIScrollViewDelegate, UIAdaptivePresentationControllerDelegate {
    private let steps: [OnboardingStepData]
    private let onFinish: (_ completed: Bool, _ lastStep: String) -> Void
    private let pager = UIScrollView()
    private let pageControl = UIPageControl()
    private let primary = UIButton(type: .system)
    private var pageTitles: [UILabel] = []
    private var page = 0
    private var pagerWidth: CGFloat = 0
    private var finished = false

    init(steps: [OnboardingStepData], onFinish: @escaping (Bool, String) -> Void) {
        self.steps = steps
        self.onFinish = onFinish
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        navigationItem.rightBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { [weak self] _ in
            self?.finish(completed: false)
        })

        pager.isPagingEnabled = true
        pager.showsHorizontalScrollIndicator = false
        pager.contentInsetAdjustmentBehavior = .never
        pager.delegate = self
        let pages = UIStackView()
        pages.axis = .horizontal
        pages.translatesAutoresizingMaskIntoConstraints = false
        pager.addSubview(pages)
        for step in steps {
            let page = makePage(step)
            pages.addArrangedSubview(page)
            page.widthAnchor.constraint(equalTo: pager.frameLayoutGuide.widthAnchor).isActive = true
        }

        pageControl.numberOfPages = steps.count
        pageControl.currentPageIndicatorTintColor = .label
        pageControl.pageIndicatorTintColor = .tertiaryLabel
        pageControl.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            self.show(self.pageControl.currentPage)
        }, for: .valueChanged)

        primary.configuration = ChromeViewController.prominentButton().configuration
        primary.configuration?.buttonSize = .large
        primary.tintColor = ChromeViewController.selectionFill
        primary.addAction(UIAction { [weak self] _ in self?.next() }, for: .primaryActionTriggered)

        for subview in [pager, pageControl, primary] as [UIView] {
            subview.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(subview)
        }
        let safeArea = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            pager.topAnchor.constraint(equalTo: safeArea.topAnchor),
            pager.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            pager.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            pager.bottomAnchor.constraint(equalTo: pageControl.topAnchor, constant: -8),
            pages.topAnchor.constraint(equalTo: pager.contentLayoutGuide.topAnchor),
            pages.bottomAnchor.constraint(equalTo: pager.contentLayoutGuide.bottomAnchor),
            pages.leadingAnchor.constraint(equalTo: pager.contentLayoutGuide.leadingAnchor),
            pages.trailingAnchor.constraint(equalTo: pager.contentLayoutGuide.trailingAnchor),
            pages.heightAnchor.constraint(equalTo: pager.frameLayoutGuide.heightAnchor),
            pageControl.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            pageControl.bottomAnchor.constraint(equalTo: primary.topAnchor, constant: -12),
            primary.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor, constant: 24),
            primary.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor, constant: -24),
            primary.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor, constant: -16),
        ])
        updateControls()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // Keeps the page in view when the sheet resizes or rotates. Only then:
        // setting the offset during a paging animation would add to it.
        guard pager.bounds.width != pagerWidth else { return }
        pagerWidth = pager.bounds.width
        pager.contentOffset.x = CGFloat(page) * pagerWidth
    }

    private func makePage(_ step: OnboardingStepData) -> UIView {
        let hero: UIImageView
        if step.logo, let logo = UIImage(named: "OnboardingLogo") {
            hero = UIImageView(image: logo)
            hero.heightAnchor.constraint(equalToConstant: 96).isActive = true
        } else {
            let symbol = UIImage.SymbolConfiguration(pointSize: 52, weight: .regular)
            hero = UIImageView(image: UIImage(systemName: step.symbol, withConfiguration: symbol))
            // Decoration stays neutral: the accent colour marks selection and actions only.
            hero.tintColor = .label
        }
        hero.contentMode = .scaleAspectFit
        hero.isAccessibilityElement = false

        let title = label(step.title, style: .largeTitle, weight: .bold, color: .label)
        title.textAlignment = .center
        title.accessibilityTraits = .header
        pageTitles.append(title)
        let intro = label(step.intro, style: .body, color: .secondaryLabel)
        intro.textAlignment = .center

        let content = UIStackView(arrangedSubviews: [hero, title, intro])
        content.axis = .vertical
        content.spacing = 16
        content.setCustomSpacing(24, after: hero)
        content.setCustomSpacing(32, after: intro)

        for feature in step.features {
            let symbol = UIImageView(image: UIImage(
                systemName: feature.symbol,
                withConfiguration: UIImage.SymbolConfiguration(textStyle: .title2)))
            symbol.tintColor = .secondaryLabel
            symbol.contentMode = .center
            symbol.widthAnchor.constraint(equalToConstant: 40).isActive = true
            symbol.isAccessibilityElement = false
            let row = UIStackView(arrangedSubviews: [symbol, label(feature.text, style: .body, color: .label)])
            row.spacing = 16
            row.alignment = .center
            content.addArrangedSubview(row)
            content.setCustomSpacing(20, after: row)
        }

        content.translatesAutoresizingMaskIntoConstraints = false
        let scroll = UIScrollView()
        scroll.showsVerticalScrollIndicator = false
        scroll.addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 8),
            content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -16),
            content.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: 28),
            content.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -28),
        ])
        return scroll
    }

    private func label(_ text: String, style: UIFont.TextStyle, weight: UIFont.Weight? = nil,
                       color: UIColor) -> UILabel {
        let label = UILabel()
        label.text = text
        label.numberOfLines = 0
        label.textColor = color
        label.adjustsFontForContentSizeCategory = true
        if let weight {
            let base = UIFont.preferredFont(forTextStyle: style)
            label.font = UIFontMetrics(forTextStyle: style).scaledFont(
                for: .systemFont(ofSize: base.pointSize, weight: weight))
        } else {
            label.font = .preferredFont(forTextStyle: style)
        }
        return label
    }

    // MARK: - Paging

    private func show(_ index: Int) {
        page = index
        pager.setContentOffset(CGPoint(x: CGFloat(index) * pager.bounds.width, y: 0), animated: true)
        updateControls()
    }

    func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
        settle()
    }

    func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
        settle()
    }

    /// The page is wherever the pager came to rest. Only then is the new page
    /// announced: moving VoiceOver's focus mid-scroll would scroll the pager too.
    private func settle() {
        guard pager.bounds.width > 0 else { return }
        page = min(max(Int((pager.contentOffset.x / pager.bounds.width).rounded()), 0), steps.count - 1)
        updateControls()
        UIAccessibility.post(notification: .screenChanged, argument: pageTitles[page])
    }

    private func updateControls() {
        pageControl.currentPage = page
        let last = page == steps.count - 1
        primary.configuration?.title = last ? "Começar a ler" : "Seguinte"
    }

    private func next() {
        if page >= steps.count - 1 {
            finish(completed: true)
        } else {
            show(page + 1)
        }
    }

    // MARK: - Finishing

    private var currentStepId: String {
        steps.indices.contains(page) ? steps[page].id : ""
    }

    private func finish(completed: Bool) {
        guard !finished else { return }
        finished = true
        onFinish(completed, currentStepId)
        dismiss(animated: true)
    }

    /// Swiped down: skipped, like Close.
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard !finished else { return }
        finished = true
        onFinish(false, currentStepId)
    }
}
