import React from 'react';

const PrivacyPolicy = () => {
    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <h1 className="text-3xl font-bold text-slate-900 mb-6">Privacy Policy</h1>
                <p className="text-slate-500 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

                <div className="prose prose-slate max-w-none space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold text-slate-800">1. Introduction</h2>
                        <p className="text-slate-600">
                            Welcome to Natya Arts Innovation ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy applies to all information collected through our mobile application, website, and related services.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-slate-800">2. Information We Collect</h2>
                        <p className="text-slate-600">
                            We collect personal information that you voluntarily provide to us when you register on the app, express an interest in obtaining information about us or our products and services, or otherwise contact us.
                        </p>
                        <ul className="list-disc pl-5 mt-2 text-slate-600 space-y-1">
                            <li><strong>Personal Information:</strong> Name, email address, phone number, and account credentials.</li>
                            <li><strong>Device Data:</strong> We may automatically collect device information (such as your IP address, device characteristics, operating system, and language preferences) when you use our app.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-slate-800">3. How We Use Your Information</h2>
                        <p className="text-slate-600">
                            We use personal information collected via our app for a variety of business purposes described below:
                        </p>
                        <ul className="list-disc pl-5 mt-2 text-slate-600 space-y-1">
                            <li>To facilitate account creation and login process.</li>
                            <li>To provide, operate, and maintain our application.</li>
                            <li>To send administrative information to you.</li>
                            <li>To protect our Services (e.g., fraud monitoring and prevention).</li>
                            <li>To send you push notifications regarding your account or classes.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-slate-800">4. Sharing Your Information</h2>
                        <p className="text-slate-600">
                            We only share information with your consent, to comply with laws, to provide you with services, to protect your rights, or to fulfill business obligations. We do not sell your personal information to third parties.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-slate-800">5. Data Retention and Security</h2>
                        <p className="text-slate-600">
                            We will only keep your personal information for as long as it is necessary for the purposes set out in this privacy notice, unless a longer retention period is required or permitted by law. We have implemented appropriate technical and organizational security measures designed to protect the security of any personal information we process.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-slate-800">6. User Rights</h2>
                        <p className="text-slate-600">
                            Depending on your location, you may have certain rights regarding your personal information, such as the right to request access to, or deletion of, your personal information. If you would like to make such a request, please contact us using the details provided below.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-slate-800">7. Contact Us</h2>
                        <p className="text-slate-600">
                            If you have questions or comments about this notice, you may email us at support@natyaarts.org.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default PrivacyPolicy;
