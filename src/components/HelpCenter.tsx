import React, { useState } from "react";
import {
  HelpCircle,
  Mail,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Book,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";

const FAQItem = ({
  question,
  answer,
}: {
  question: string;
  answer: React.ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-[#112544] last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex justify-between items-center w-full py-4 text-left"
      >
        <span className="font-medium text-white">{question}</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-blue-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-blue-400" />
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pb-4 text-gray-300 text-sm space-y-2">{answer}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const HelpCategoryCard = ({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="bg-[#161628] rounded-xl p-5 text-left transition-all hover:bg-[#1c1c30] hover:scale-[1.02]"
  >
    <div className="flex items-center gap-3 mb-2">
      <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
        {icon}
      </div>
      <h3 className="text-white font-medium">{title}</h3>
    </div>
    <p className="text-gray-400 text-sm">{description}</p>
  </button>
);

export default function HelpCenter() {
  const faqs = [
    {
      question: "How do I get started with NeuroSwarm?",
      answer: (
        <>
          <p>
            Getting started with NeuroSwarm is easy! Just follow these steps:
          </p>
          <ol className="list-decimal ml-5 mt-2 space-y-1">
            <li>Create an account or sign in if you already have one</li>
            <li>Complete your profile setup</li>
            <li>Explore available tasks and opportunities</li>
            <li>Join your first swarm and start contributing</li>
          </ol>
        </>
      ),
    },
    {
      question: "How do earnings and payments work?",
      answer: (
        <>
          <p>
            Earnings are calculated based on your contributions to swarms and
            tasks. Payments are processed at the end of each cycle, typically
            monthly. You can track your earnings in the dashboard and withdraw
            funds once they reach the minimum threshold.
          </p>
        </>
      ),
    },
    {
      question: "What skills do I need to participate?",
      answer: (
        <>
          <p>
            NeuroSwarm welcomes participants with various skill levels.
            Different swarms may require different expertise, from data labeling
            to complex AI training. You can browse opportunities that match your
            skills and experience level.
          </p>
        </>
      ),
    },
    {
      question: "How secure is my data on NeuroSwarm?",
      answer: (
        <>
          <p>
            We take data security very seriously. All personal information is
            encrypted and stored securely. We comply with global data protection
            regulations and never share your personal information with third
            parties without your consent.
          </p>
        </>
      ),
    },
    {
      question: "Can I participate from anywhere in the world?",
      answer: (
        <>
          <p>
            Yes! NeuroSwarm is a global platform. You can participate from
            anywhere with an internet connection. However, certain tasks or
            payment methods may have regional restrictions due to regulatory
            requirements.
          </p>
        </>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6 rounded-3xl max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <HelpCircle className="w-6 h-6 text-blue-400" />
        <h2 className="text-2xl font-bold">Help Center</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HelpCategoryCard
          icon={<MessageSquare className="w-5 h-5 text-blue-400" />}
          title="Contact Support"
          description="Get in touch with our support team for personalized assistance"
          onClick={() =>
            document
              .getElementById("contact-section")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        />
        <HelpCategoryCard
          icon={<Book className="w-5 h-5 text-green-400" />}
          title="User Guides"
          description="Step-by-step guides to help you navigate the platform"
          onClick={() =>
            document
              .getElementById("faq-section")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        />
        <HelpCategoryCard
          icon={<FileText className="w-5 h-5 text-yellow-400" />}
          title="Documentation"
          description="Detailed documentation about features and processes"
          onClick={() =>
            document
              .getElementById("resources-section")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        />
      </div>

      <div id="faq-section" className="mt-10">
        <h3 className="text-xl font-semibold mb-4">
          Frequently Asked Questions
        </h3>
        <div className="bg-[#161628] rounded-xl p-5 border border-[#112544]/50 shadow-lg">
          {faqs.map((faq, index) => (
            <FAQItem key={index} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </div>

      <div id="contact-section" className="mt-10">
        <h3 className="text-xl font-semibold mb-4">Contact Support</h3>
        <div className="bg-[#161628] rounded-xl p-6 border border-[#112544]/50 shadow-lg">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <h4 className="font-medium text-white mb-2">Send us a message</h4>
              <p className="text-gray-400 text-sm mb-4">
                Our support team typically responds within 24 hours during
                business days.
              </p>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm text-gray-300 mb-1"
                  >
                    Your Name
                  </label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your name"
                    className="bg-[#0A1A2F] border-[#112544] text-white w-full"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm text-gray-300 mb-1"
                  >
                    Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    className="bg-[#0A1A2F] border-[#112544] text-white w-full"
                  />
                </div>

                <div>
                  <label
                    htmlFor="message"
                    className="block text-sm text-gray-300 mb-1"
                  >
                    Message
                  </label>
                  <textarea
                    id="message"
                    placeholder="Describe your issue or question"
                    rows={4}
                    className="bg-[#0A1A2F] border border-[#112544] text-white rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  Submit Request
                </Button>
              </div>
            </div>

            <div className="md:w-72 space-y-4">
              <div className="bg-[#0A1A2F] p-4 rounded-lg border border-[#112544]/50">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-blue-400 mt-0.5" />
                  <div>
                    <h5 className="font-medium text-white">Email Support</h5>
                    <p className="text-blue-400 text-sm break-all">
                      SUPPORT@NEUROLOV.AI
                    </p>
                    <p className="text-gray-400 text-xs mt-1">
                      For general inquiries and support
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-[#0A1A2F] p-4 rounded-lg border border-[#112544]/50">
                <h5 className="font-medium text-white mb-2">Support Hours</h5>
                <div className="text-sm text-gray-300 space-y-1">
                  <p>Monday - Friday</p>
                  <p>9:00 AM - 6:00 PM UTC</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="resources-section" className="mt-10">
        <h3 className="text-xl font-semibold mb-4">Additional Resources</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#161628] rounded-xl p-5 border border-[#112544]/50 shadow-lg">
            <h4 className="font-medium text-white mb-2">User Guides</h4>
            <p className="text-gray-400 text-sm mb-3">
              Step-by-step guides to help you navigate the platform effectively
            </p>
            <Button
              variant="outline"
              className="text-blue-400 border-blue-400/30 hover:bg-blue-400/10"
            >
              <Book className="w-4 h-4 mr-2" />
              Browse Guides
            </Button>
          </div>

          <div className="bg-[#161628] rounded-xl p-5 border border-[#112544]/50 shadow-lg">
            <h4 className="font-medium text-white mb-2">Community Forum</h4>
            <p className="text-gray-400 text-sm mb-3">
              Connect with other users, share tips, and get community support
            </p>
            <Button
              variant="outline"
              className="text-green-400 border-green-400/30 hover:bg-green-400/10"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Visit Forum
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
