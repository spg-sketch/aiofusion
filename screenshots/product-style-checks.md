# Authenticated product style checks

The `product-*.png` captures show actual React product screens at desktop
(1440 x 1000) and mobile (390 x 844) sizes. Browser-only API fixtures supplied
an example agency/owner or master/owner and an empty example project.
No real account, production data, or credentials were used. These are visual
and client-navigation checks, not evidence of successful server authentication.

Checked Platform Home -> Project Hub -> workspace, and Platform Home ->
Account Settings / Master Admin. Return actions retained their destinations.
The settings return button computes to 13px bold Inter, 44px height and a
pointer cursor at both widths; keyboard focus has a visible 3px outline.
The final settings captures include that focus state.

Some settings image slots have unavailable images because the visual fixture
does not provide profile or workspace assets. Empty data and unavailable
optional sections in these captures are fixture conditions.

Behaviour coverage is in the existing navigation/responsive tests and
`components/ui/button.test.tsx`, including disabled/loading activation and
link semantics. The screenshots are review evidence, not a visual baseline
automation suite.